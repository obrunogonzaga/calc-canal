import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
async function main() {
  const { getDb } = await import("../src/lib/server/db");
  const db = getDb();
  await db.query(`CREATE TABLE IF NOT EXISTS saved_simulation (
 id text PRIMARY KEY,
 user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 channel text NOT NULL CHECK (channel IN ('mercado_livre','shopee','amazon_br','magalu')),
 input jsonb NOT NULL,
 result jsonb NOT NULL,
 rule_id text NOT NULL,
 fingerprint text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,fingerprint)
)`);
  await db.query(
    "CREATE INDEX IF NOT EXISTS saved_simulation_owner_created ON saved_simulation(user_id,created_at DESC)",
  );
  await db.end();
  console.log("Tabela de simulações pronta.");
}
main().catch(() => {
  console.error("Falha ao preparar tabela de simulações.");
  process.exitCode = 1;
});
