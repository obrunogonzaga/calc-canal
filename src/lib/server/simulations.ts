import { createHash, randomUUID } from "node:crypto";
import { getDb } from "./db";
import { validateDraft } from "@/lib/simulation-draft";
import { calculatePricing, type PricingBreakdown } from "@/lib/pricing";
import { mlDropOffRule } from "@/lib/tariffs";

export interface SavedSimulation {
  id: string;
  channel: string;
  created_at: string;
  result: PricingBreakdown;
  rule_id: string;
}
export async function listSimulations(
  userId: string,
): Promise<SavedSimulation[]> {
  const { rows } = await getDb().query<SavedSimulation>(
    "SELECT id, channel, created_at, result, rule_id FROM saved_simulation WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10",
    [userId],
  );
  return rows;
}
export async function saveSimulation(
  userId: string,
  value: unknown,
): Promise<SavedSimulation> {
  const draft = validateDraft(value);
  const result = calculatePricing(draft.input);
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(draft))
    .digest("hex");
  const client = await getDb().connect();
  try {
    await client.query("BEGIN");
    // Serialize imports per account so retries and concurrent tabs cannot exceed the preview quota.
    await client.query('SELECT id FROM "user" WHERE id = $1 FOR UPDATE', [
      userId,
    ]);
    const duplicate = await client.query<SavedSimulation>(
      "SELECT id,channel,created_at,result,rule_id FROM saved_simulation WHERE user_id=$1 AND fingerprint=$2",
      [userId, fingerprint],
    );
    if (duplicate.rows[0]) {
      await client.query("COMMIT");
      return duplicate.rows[0];
    }
    const count = await client.query<{ count: string }>(
      "SELECT count(*) FROM saved_simulation WHERE user_id=$1",
      [userId],
    );
    if (Number(count.rows[0].count) >= 10)
      throw new Error("PREVIEW_SIMULATION_LIMIT");
    const ruleId =
      draft.tariffMode === "manual" ? "manual-v1" : mlDropOffRule.id;
    const saved = await client.query<SavedSimulation>(
      "INSERT INTO saved_simulation (id,user_id,channel,input,result,rule_id,fingerprint) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id,channel,created_at,result,rule_id",
      [
        randomUUID(),
        userId,
        draft.channelId,
        JSON.stringify(draft),
        JSON.stringify(result),
        ruleId,
        fingerprint,
      ],
    );
    await client.query("COMMIT");
    return saved.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
