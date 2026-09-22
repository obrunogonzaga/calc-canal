import { config } from "dotenv";
import { readFile } from "node:fs/promises";

config({ path: ".env.local", quiet: true });

async function main(): Promise<void> {
  if (process.argv.includes("--test")) {
    const testDatabaseUrl = process.env.TEST_DATABASE_URL;

    if (!testDatabaseUrl) {
      throw new Error("O banco de teste não está configurado.");
    }

    process.env.DATABASE_URL = testDatabaseUrl;
  }

  const { closeDbForTests, getDb } = await import("../src/lib/server/db");

  try {
    const migrationSql = await readFile(
      new URL("../migrations/0002_products.sql", import.meta.url),
      "utf8",
    );

    await getDb().query(migrationSql);
  } finally {
    await closeDbForTests();
  }
}

void main().catch(() => {
  console.error("A migração de produtos falhou.");
  process.exitCode = 1;
});
