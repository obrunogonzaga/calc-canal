import { config } from "dotenv";
import { readFile } from "node:fs/promises";
import { closeDbForTests, getDb } from "../src/lib/server/db";

config({ path: ".env.local", quiet: true });

async function main() {
  if (process.argv.includes("--test")) {
    if (!process.env.TEST_DATABASE_URL) throw new Error("O banco de teste não está configurado.");
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  }
  try {
    const sql = await readFile(new URL("../migrations/0009_account_data_requests.sql", import.meta.url), "utf8");
    await getDb().query(sql);
  } finally {
    await closeDbForTests();
  }
}

void main().catch(() => {
  console.error("A migração de solicitações de dados falhou.");
  process.exitCode = 1;
});
