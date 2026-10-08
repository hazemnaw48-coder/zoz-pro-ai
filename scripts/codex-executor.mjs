import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";

const execFileAsync = promisify(execFile);
const CONTROL_URL = (process.env.ZOZ_PRO_CONTROL_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const CONTROL_TOKEN = process.env.ZOZ_CONTROL_TOKEN ?? "";
if (!CONTROL_TOKEN) throw new Error("ZOZ_CONTROL_TOKEN is required.");
const POLL_MS = Number(process.env.ZOZ_PRO_POLL_MS ?? 5000);
const REPO_DIR = process.env.ZOZ_PRO_REPO_DIR ?? process.cwd();
const MAX_OUTPUT = 12000;

async function post(path, body) {
  const response = await fetch(`${CONTROL_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${CONTROL_TOKEN}` },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
  return data;
}

async function heartbeat(extra = {}) {
  try { await post("/api/executor/heartbeat", { hostname: os.hostname(), ...extra }); }
  catch (error) { console.error("[executor] heartbeat failed:", error.message); }
}

async function claimNext() {
  const response = await fetch(`${CONTROL_URL}/api/control/commands`, { cache: "no-store", headers: { authorization: `Bearer ${CONTROL_TOKEN}` } });
  if (!response.ok) throw new Error(`queue HTTP ${response.status}`);
  const { commands = [] } = await response.json();
  return commands.find((command) => command.status === "queued" && !command.requiresApproval);
}

async function runCodex(command) {
  const prompt = [
    "You are the primary implementation agent for ZOZ Pro.",
    "Work ONLY inside the current repository checkout.",
    "The owner sent this task through the ZOZ Pro mobile control plane:",
    "", command.instruction, "",
    "Rules:",
    "- Work only on the assigned ZOZ Pro task.",
    "- Never modify or access the legacy ZOZ AI repository.",
    "- Do not deploy or merge to main.",
    "- Do not change credentials, secrets, accounts, WhatsApp, financial systems, or external services.",
    "- Do not bypass approval gates.",
    "- Inspect existing code before changing it.",
    "- Run relevant tests/build after changes.",
    "- If the request requires a blocked/high-risk action, stop and report it.",
  ].join("\n");
  const result = await execFileAsync("codex", [
    "exec","--json","--sandbox","workspace-write","--ask-for-approval","never",prompt
  ], { cwd: REPO_DIR, maxBuffer: 2 * 1024 * 1024, windowsHide: true });
  return { output: (result.stdout ?? "").slice(-MAX_OUTPUT), diagnostics: (result.stderr ?? "").slice(-MAX_OUTPUT) };
}

async function transitionTask(taskId, status, body = {}) {
  return post(`/api/tasks/${encodeURIComponent(taskId)}/transition`, {
    actor: "Codex Executor",
    status,
    ...body,
  });
}

async function processOne(command) {
  await post(`/api/control/commands/${encodeURIComponent(command.id)}/claim`, { actor: "Codex Executor" });
  await heartbeat({ currentCommandId: command.id });
  try {
    if (command.taskId) {
      const task = await fetch(`${CONTROL_URL}/api/state`, { headers: { authorization: `Bearer ${CONTROL_TOKEN}` } }).then(async (response) => {
        if (!response.ok) throw new Error(`state HTTP ${response.status}`);
        return response.json();
      }).then((state) => state.tasks.find((item) => item.id === command.taskId));
      if (!task) throw new Error(`task not found: ${command.taskId}`);
      if (task.status === "planned") await transitionTask(command.taskId, "assigned");
      await transitionTask(command.taskId, "executing");
    }
    const result = await runCodex(command);
    const commit = await execFileAsync("git", ["rev-parse","HEAD"], { cwd: REPO_DIR, windowsHide: true });
    const commitSha = commit.stdout.trim();
    if (command.taskId) {
      await transitionTask(command.taskId, "verification", {
        result: `Implementation finished; awaiting verification. commit=${commitSha}`,
      });
    }
    await post(`/api/control/commands/${encodeURIComponent(command.id)}/complete`, {
      actor:"Codex", result:`Codex completed. commit=${commitSha}\n${result.output}`
    });
    await heartbeat({ currentCommandId:null, lastError:null });
  } catch (error) {
    if (command.taskId) {
      await transitionTask(command.taskId, "failed", {
        result: `Executor failure: ${error.message}`,
      }).catch(() => {});
    }
    await post(`/api/control/commands/${encodeURIComponent(command.id)}/fail`, {
      actor:"Codex", error:`Codex executor failed: ${error.message}`
    }).catch(()=>{});
    await heartbeat({ currentCommandId:null, lastError:error.message });
  }
}

let busy=false;
async function loop() {
  if (busy) return;
  busy=true;
  try { await heartbeat(); const command=await claimNext(); if(command){ console.log(`[executor] claiming ${command.id}`); await processOne(command); } }
  catch(error){ console.error("[executor] loop error:", error.message); }
  finally { busy=false; }
}
console.log(`[executor] ZOZ Pro Codex bridge -> ${CONTROL_URL}`);
console.log(`[executor] repo -> ${REPO_DIR}`);
await loop();
setInterval(loop, POLL_MS);
