import { config } from "dotenv";
import { readFile } from "node:fs/promises";

import { getMigrations } from "better-auth/db/migration";

import { closeDbForTests, getDb } from "../src/lib/server/db";

config({ path: ".env.local", quiet: true });

async function main(): Promise<void> {
  if (process.argv.includes("--test")) {
    const testDatabaseUrl = process.env.TEST_DATABASE_URL;

    if (!testDatabaseUrl) {
      throw new Error("O banco de teste não está configurado.");
    }

    process.env.DATABASE_URL = testDatabaseUrl;
  }

  const { getAuth } = await import("../src/lib/server/auth");
  const migrations = await getMigrations(getAuth().options);

  await migrations.runMigrations();

  const migrationSql = await readFile(
    new URL("../migrations/0001_auth_email_verification_tokens.sql", import.meta.url),
    "utf8"
  );

  await getDb().query(migrationSql);
}

void main()
  .catch(() => {
    console.error("A migração de autenticação falhou.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDbForTests();
  });
