import { config } from "dotenv";
import { readFile } from "node:fs/promises";

config({ path: ".env.local", quiet: true });

async function main(): Promise<void> {
  if (process.argv.includes("--test")) {
    if (!process.env.TEST_DATABASE_URL)
      throw new Error("O banco de teste não está configurado.");
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  }
  const { closeDbForTests, getDb } = await import("../src/lib/server/db");
  try {
    const sql = await readFile(
      new URL("../migrations/0007_subscription_lifecycle.sql", import.meta.url),
      "utf8",
    );
    await getDb().query(sql);
  } finally {
    await closeDbForTests();
  }
}

void main().catch(() => {
  console.error("A migração de ciclo de assinatura falhou.");
  process.exitCode = 1;
});
