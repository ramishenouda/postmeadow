/**
 * Runs the end-to-end tests against an isolated stack:
 *   - database `newsletter_test` (created and migrated here; your dev data is untouched)
 *   - a separate Mailpit (docker compose profile "test", ports 1026/8026)
 *   - a production build of the app on port 3100
 *
 *   npm run test:e2e                 # build + run everything
 *   npm run test:e2e -- --skip-build # reuse the last build
 *   npm run test:e2e -- tests/e2e/webhooks.test.ts
 */
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { readdirSync, rmSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { loadEnvConfig } from "@next/env";
import postgres from "postgres";

const ROOT = process.cwd();
const PORT = 3100;
const TEST_DB = "newsletter_test";
const MAILPIT = "http://localhost:8026";
const CONFIRMATION_CAP = "20";
const STORAGE_DIR = "./storage-test"; // uploads from tests; emptied on every run
// A fixed, obviously-fake signing secret shared by the test server and the tests.
const WEBHOOK_SECRET = `whsec_${Buffer.from("e2e-only-webhook-signing-secret!").toString("base64")}`;

const args = process.argv.slice(2);
const skipBuild = args.includes("--skip-build");
const skipDocker = args.includes("--skip-docker");
const files = args.filter((a) => !a.startsWith("--"));

loadEnvConfig(ROOT); // .env / .env.local, for the Postgres credentials
const baseUrl = process.env.DATABASE_URL;
if (!baseUrl) throw new Error("DATABASE_URL is not set (see .env.example)");
const testUrl = new URL(baseUrl);
testUrl.pathname = `/${TEST_DB}`;

const serverEnv: NodeJS.ProcessEnv = {
  ...process.env,
  APP_URL: `http://localhost:${PORT}`,
  DATABASE_URL: testUrl.toString(),
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "e2e-only-auth-secret-0123456789abcdef",
  EMAIL_TRANSPORT: "smtp",
  SMTP_HOST: "localhost",
  SMTP_PORT: "1026",
  EMAIL_FROM: "Newsletter <no-reply@localhost>",
  RESEND_WEBHOOK_SECRET: WEBHOOK_SECRET,
  CONFIRMATIONS_PER_PUBLICATION_PER_HOUR: CONFIRMATION_CAP,
  CLIENT_IP_HEADER: "", // tests send X-Forwarded-For to look like different visitors
  STORAGE_DIR,
};

function run(cmd: string, cmdArgs: string[], env = process.env) {
  console.log(`\n$ ${cmd} ${cmdArgs.join(" ")}`);
  execFileSync(cmd, cmdArgs, { stdio: "inherit", env, cwd: ROOT });
}

async function ensureTestDatabase() {
  const admin = postgres(baseUrl!, { max: 1, onnotice: () => {} });
  try {
    const [exists] = await admin`select 1 from pg_database where datname = ${TEST_DB}`;
    if (!exists) {
      console.log(`Creating database ${TEST_DB}`);
      await admin.unsafe(`create database "${TEST_DB}"`);
    }
  } finally {
    await admin.end();
  }
  run("npx", ["drizzle-kit", "migrate"], { ...process.env, DATABASE_URL: testUrl.toString() });
}

async function waitForHealth(server: ChildProcess) {
  const end = Date.now() + 60_000;
  while (Date.now() < end) {
    if (server.exitCode !== null) throw new Error("The test server exited during startup");
    try {
      const res = await fetch(`http://localhost:${PORT}/api/health`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await sleep(500);
  }
  throw new Error("The test server did not become healthy within 60s");
}

async function main() {
  if (!skipDocker) {
    run("docker", [
      "compose",
      "--profile",
      "test",
      "up",
      "-d",
      "--wait",
      "postgres",
      "mailpit-test",
    ]);
  }
  await ensureTestDatabase();
  rmSync(STORAGE_DIR, { recursive: true, force: true });
  if (!skipBuild) run("npx", ["next", "build"], serverEnv);

  console.log(`\nStarting test server on :${PORT}`);
  const server = spawn("npx", ["next", "start", "-p", String(PORT)], {
    env: serverEnv,
    cwd: ROOT,
    stdio: ["ignore", "inherit", "inherit"],
    detached: true, // own process group, so we can stop npx and next together
  });
  const stop = () => {
    try {
      process.kill(-server.pid!, "SIGTERM");
    } catch {
      // already gone
    }
  };
  process.on("SIGINT", () => {
    stop();
    process.exit(130);
  });

  let code = 1;
  try {
    await waitForHealth(server);
    const testFiles = files.length
      ? files
      : readdirSync("tests/e2e")
          .filter((f) => f.endsWith(".test.ts"))
          .map((f) => `tests/e2e/${f}`);
    // Files share one database and inbox, so they run one at a time.
    const tests = spawn(
      process.execPath,
      ["--import", "tsx", "--test", "--test-concurrency=1", ...testFiles],
      {
        cwd: ROOT,
        stdio: "inherit",
        env: {
          ...process.env,
          E2E_BASE: `http://localhost:${PORT}`,
          E2E_MAILPIT: MAILPIT,
          E2E_DATABASE_URL: testUrl.toString(),
          E2E_RESEND_WEBHOOK_SECRET: WEBHOOK_SECRET,
          E2E_CONFIRMATION_CAP: CONFIRMATION_CAP,
          E2E_STORAGE_DIR: STORAGE_DIR,
          E2E_ACTION_MANIFEST: `${ROOT}/.next/server/server-reference-manifest.json`,
        },
      },
    );
    code = await new Promise<number>((resolve) => tests.on("exit", (c) => resolve(c ?? 1)));
  } finally {
    stop();
  }
  process.exit(code);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
