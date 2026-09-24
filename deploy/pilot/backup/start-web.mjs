import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";

const password = readFileSync("/run/secrets/pilot_db_password", "utf8").trimEnd();
if (!password) {
  throw new Error("The pilot database password secret is empty.");
}

const databaseUrl = new URL("postgresql://liquido@db:5432/liquido");
databaseUrl.password = password;

const childEnvironment = { ...process.env, DATABASE_URL: databaseUrl.toString() };
if (process.env.AUTH_ENABLED === "true") {
  childEnvironment.BETTER_AUTH_SECRET = readFileSync(
    "/run/secrets/pilot_auth_secret",
    "utf8",
  ).trimEnd();
  childEnvironment.SMTP_PASSWORD = readFileSync(
    "/run/secrets/pilot_resend_api_key",
    "utf8",
  ).trimEnd();
  if (!childEnvironment.BETTER_AUTH_SECRET || !childEnvironment.SMTP_PASSWORD) {
    throw new Error("The pilot account secrets are empty.");
  }
}

const [executable = "npm", ...arguments_] = process.argv.slice(2);
const child = spawn(executable, arguments_.length ? arguments_ : ["run", "start"], {
  stdio: "inherit",
  env: childEnvironment,
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("error", (error) => {
  console.error("Could not start the pilot web process:", error.message);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
