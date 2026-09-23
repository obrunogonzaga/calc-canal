import { createHash, randomUUID } from "node:crypto";

import { Pool } from "pg";

interface GlobalDatabaseState {
  liquidoDatabasePool?: Pool;
}

const globalDatabase = globalThis as typeof globalThis & GlobalDatabaseState;

function getRequiredDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error("A configuração do banco de dados não está disponível.");
  }

  return databaseUrl;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function getDb(): Pool {
  if (!globalDatabase.liquidoDatabasePool) {
    globalDatabase.liquidoDatabasePool = new Pool({
      connectionString: getRequiredDatabaseUrl(),
    });
  }

  return globalDatabase.liquidoDatabasePool;
}

export async function closeDbForTests(): Promise<void> {
  const pool = globalDatabase.liquidoDatabasePool;
  globalDatabase.liquidoDatabasePool = undefined;

  if (pool) {
    await pool.end();
  }
}

export async function createEmailVerificationTokenRecord(
  token: string,
  expiresAt: Date
): Promise<string> {
  if (!token || !Number.isFinite(expiresAt.getTime())) {
    throw new Error("Não foi possível registrar o link de verificação.");
  }

  const id = randomUUID();
  const db = getDb();

  await db.query(
    `
      INSERT INTO auth_email_verification_tokens (id, token_hash, expires_at)
      VALUES ($1, $2, $3)
    `,
    [id, hashToken(token), expiresAt]
  );
  await db.query(
    `
      DELETE FROM auth_email_verification_tokens
      WHERE expires_at < NOW() - INTERVAL '24 hours'
    `
  );

  return id;
}

export async function consumeEmailVerificationTokenRecord(
  id: string,
  token: string
): Promise<boolean> {
  if (!id || !token) {
    return false;
  }

  const result = await getDb().query<{ id: string }>(
    `
      UPDATE auth_email_verification_tokens
      SET consumed_at = NOW()
      WHERE id = $1
        AND token_hash = $2
        AND consumed_at IS NULL
        AND expires_at > NOW()
      RETURNING id
    `,
    [id, hashToken(token)]
  );

  return result.rowCount === 1;
}
