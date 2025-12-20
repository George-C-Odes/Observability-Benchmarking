import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import PQueue from "p-queue";
import { parse as shellParse } from "shell-quote";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";

const {
  ORCH_API_KEY = "",
  WORKSPACE = "/workspace",
  DEFAULT_PROJECT_DIR = "compose",
  MAX_OUTPUT_LINES = "20000",
  COMMAND_TIMEOUT_SECONDS = "1800", // 30 min
  QUEUE_CONCURRENCY = "1",
  PORT = "4000",
  HOST = "0.0.0.0",
  CORS_ORIGIN = "http://localhost:3001",
} = process.env;

const maxLines = Number(MAX_OUTPUT_LINES);
const timeoutMs = Number(COMMAND_TIMEOUT_SECONDS) * 1000;

const fastify = Fastify({ logger: true });

await fastify.register(cors, {
  origin: (origin, cb) => {
    // Allow server-to-server (no origin) and your dashboard origin
    if (!origin) return cb(null, true);
    if (origin === CORS_ORIGIN) return cb(null, true);
    return cb(null, false);
  },
});

await fastify.register(rateLimit, {
  max: 60,
  timeWindow: "1 minute",
});

// Simple single-machine job store (good enough for local dev)
const jobs = new Map();
/**
 * job = {
 *   id, createdAt, startedAt, finishedAt,
 *   status: 'queued'|'running'|'succeeded'|'failed'|'canceled',
 *   exitCode,
 *   command,
 *   args,
 *   cwd,
 *   lines: string[],
 *   listeners: Set<Function>
 * }
 */

const queue = new PQueue({ concurrency: Number(QUEUE_CONCURRENCY) });

// ---------- Security / Validation helpers ----------

function requireAuth(req) {
  if (!ORCH_API_KEY) return; // allow if not set (local dev)
  const header = req.headers["authorization"] || "";
  const ok = header === `Bearer ${ORCH_API_KEY}`;
  if (!ok) {
    const err = new Error("Unauthorized");
    err.statusCode = 401;
    throw err;
  }
}

function pushLine(job, line) {
  if (!line) return;
  job.lines.push(line);
  if (job.lines.length > maxLines) job.lines.splice(0, job.lines.length - maxLines);
  for (const fn of job.listeners) fn(line);
}

function normalizeWorkspace(p) {
  // Ensure resolved paths stay under WORKSPACE
  const resolved = path.resolve(WORKSPACE, p);
  const ws = path.resolve(WORKSPACE);
  if (!resolved.startsWith(ws + path.sep) && resolved !== ws) {
    throw new Error(`Path escapes workspace: ${p}`);
  }
  return resolved;
}

function validateAndBuildSpawn(commandText) {
  // Parse shell-like quoting, but we will NOT use a shell to execute.
  const parsed = shellParse(commandText).filter(Boolean);
  const args = parsed.map((x) => (typeof x === "object" ? String(x.op) : String(x)));

  if (args.length < 2) throw new Error("Command too short.");

  // Allow only: docker compose ...
  if (args[0] !== "docker") throw new Error("Only 'docker compose ...' is allowed.");
  if (args[1] !== "compose") throw new Error("Only 'docker compose ...' is allowed.");

  // Disallow connecting to a different daemon
  const forbiddenFlags = new Set(["-H", "--host", "--context"]);
  for (let i = 0; i < args.length; i++) {
    if (forbiddenFlags.has(args[i])) throw new Error(`Forbidden flag: ${args[i]}`);
  }

  // Require a compose subcommand and restrict it (robust local allowlist)
  // Feel free to expand as you need.
  const allowedSubcommands = new Set([
    "up", "down", "build", "pull", "restart", "stop", "start", "ps", "logs", "config", "top"
  ]);

  // Find first non-flag after "docker compose"
  let subIdx = 2;
  while (subIdx < args.length && args[subIdx].startsWith("-")) subIdx++;
  const sub = args[subIdx];
  if (!sub || !allowedSubcommands.has(sub)) {
    throw new Error(`Compose subcommand not allowed. Allowed: ${Array.from(allowedSubcommands).join(", ")}`);
  }

  // Enforce project-directory under WORKSPACE (and default it if missing)
  const hasProjDir = args.includes("--project-directory");
  if (hasProjDir) {
    const idx = args.indexOf("--project-directory");
    const val = args[idx + 1];
    if (!val) throw new Error("--project-directory requires a value");
    // only allow paths inside WORKSPACE
    normalizeWorkspace(val);
  } else {
    // Inject default project directory
    args.splice(2, 0, "--project-directory", DEFAULT_PROJECT_DIR);
  }

  // Better logs for build output
  if (sub === "build" && !args.includes("--progress")) {
    args.push("--progress", "plain");
  }

  // Note: we execute from WORKSPACE so relative --project-directory works
  return { cmd: args[0], args: args.slice(1), cwd: WORKSPACE };
}

// ---------- API ----------

fastify.get("/health", async () => ({ ok: true, hostname: os.hostname() }));

const runSchema = z.object({
  command: z.string().min(3).max(2000),
});

fastify.post("/v1/run", async (req, reply) => {
  requireAuth(req);

  const { command } = runSchema.parse(req.body);

  const job = {
    id: uuidv4(),
    createdAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
    status: "queued",
    exitCode: null,
    command,
    cmd: null,
    args: null,
    cwd: null,
    lines: [],
    listeners: new Set(),
  };

  jobs.set(job.id, job);

  queue.add(() => executeJob(job)).catch((err) => {
    job.status = "failed";
    job.finishedAt = new Date().toISOString();
    pushLine(job, `[orchestrator] internal error: ${err?.message || String(err)}`);
  });

  return reply.code(202).send({ jobId: job.id, statusUrl: `/v1/jobs/${job.id}`, eventsUrl: `/v1/jobs/${job.id}/events` });
});

fastify.get("/v1/jobs/:id", async (req, reply) => {
  requireAuth(req);
  const id = req.params.id;
  const job = jobs.get(id);
  if (!job) return reply.code(404).send({ error: "Not found" });
  return {
    id: job.id,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    status: job.status,
    exitCode: job.exitCode,
    command: job.command,
    lastLines: job.lines.slice(-200),
  };
});

// Server-Sent Events: stream output live
fastify.get("/v1/jobs/:id/events", async (req, reply) => {
  requireAuth(req);
  const id = req.params.id;
  const job = jobs.get(id);
  if (!job) return reply.code(404).send({ error: "Not found" });

  reply.raw.setHeader("Content-Type", "text/event-stream");
  reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
  reply.raw.setHeader("Connection", "keep-alive");
  reply.raw.flushHeaders?.();

  const write = (line) => {
    // SSE format
    reply.raw.write(`data: ${JSON.stringify({ line })}\n\n`);
  };

  // Send existing buffered lines
  for (const line of job.lines.slice(-500)) write(line);

  job.listeners.add(write);

  req.raw.on("close", () => {
    job.listeners.delete(write);
  });
});

// ---------- Execution ----------

async function executeJob(job) {
  job.startedAt = new Date().toISOString();
  job.status = "running";

  let spawnSpec;
  try {
    spawnSpec = validateAndBuildSpawn(job.command);
    job.cmd = spawnSpec.cmd;
    job.args = spawnSpec.args;
    job.cwd = spawnSpec.cwd;
  } catch (e) {
    job.status = "failed";
    job.finishedAt = new Date().toISOString();
    pushLine(job, `[orchestrator] rejected: ${e?.message || String(e)}`);
    return;
  }

  pushLine(job, `[orchestrator] running: ${job.cmd} ${job.args.join(" ")}`);
  pushLine(job, `[orchestrator] cwd: ${job.cwd}`);

  await new Promise((resolve) => {
    const child = spawn(job.cmd, job.args, {
      cwd: job.cwd,
      env: {
        ...process.env,
        DOCKER_BUILDKIT: process.env.DOCKER_BUILDKIT ?? "1",
        COMPOSE_DOCKER_CLI_BUILD: process.env.COMPOSE_DOCKER_CLI_BUILD ?? "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    const killTimer = setTimeout(() => {
      pushLine(job, `[orchestrator] timeout after ${timeoutMs}ms, sending SIGTERM...`);
      try { child.kill("SIGTERM"); } catch {}
      setTimeout(() => {
        pushLine(job, `[orchestrator] still running, sending SIGKILL...`);
        try { child.kill("SIGKILL"); } catch {}
      }, 10_000);
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk) => {
      for (const line of chunk.split(/\r?\n/)) if (line) pushLine(job, line);
    });
    child.stderr.on("data", (chunk) => {
      for (const line of chunk.split(/\r?\n/)) if (line) pushLine(job, line);
    });

    child.on("error", (err) => {
      clearTimeout(killTimer);
      job.exitCode = 1;
      job.status = "failed";
      job.finishedAt = new Date().toISOString();
      pushLine(job, `[orchestrator] spawn error: ${err?.message || String(err)}`);
      resolve();
    });

    child.on("close", (code) => {
      clearTimeout(killTimer);
      job.exitCode = code;
      job.status = code === 0 ? "succeeded" : "failed";
      job.finishedAt = new Date().toISOString();
      pushLine(job, `[orchestrator] exited with code ${code}`);
      resolve();
    });
  });
}

fastify.listen({ port: Number(PORT), host: HOST }).then(() => {
  fastify.log.info(`orchestrator listening on ${HOST}:${PORT}`);
});
