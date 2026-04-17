const express = require("express");
const axios = require("axios");
const { execSync } = require("child_process");
const path = require("path");

const app = express();
const PORT = 3000;

// ─── Config ───────────────────────────────────────────────────────────────────

const OLLAMA_URL = (process.env.OLLAMA_HOST || "http://localhost:11434") + "/api/generate";
const MODEL = process.env.OLLAMA_MODEL || "qwen2.5:1.5b";

const DANGEROUS_PATTERNS = [
  /rm\s+-rf/i,
  /del\s+\/[sf]/i,
  /format\s+[a-z]:/i,
  /rd\s+\/s/i,
  /shutdown/i,
  /taskkill/i,
  /reg\s+delete/i,
  /net\s+user/i,
  /cipher\s+\/w/i,
  /:(){ :|:& };:/,
  />\s*(\/dev\/sda|[a-z]:)/i,
  /cscript|wscript/i,
  /\.vbs|\.ps1|\.bat/i,
];

const SYSTEM_PROMPT = `You are a Windows CMD command generator.
The user will describe what they want to do in plain English.
Rules:
- Reply with ONLY the raw Windows CMD command
- No explanation, no markdown, no backticks, no code blocks
- Just the plain command text, nothing else
- Never use interactive commands like TIME, DATE (without /T), PAUSE, SET /P
- For time use: echo %time%  — for date use: echo %date%
- Only use built-in Windows CMD commands (dir, echo, ipconfig, ping, etc.)
- Never reference external scripts, VBScript, PowerShell, or files that may not exist
- Never pipe to cscript, wscript, or any script engine
- If the task requires internet access, external tools, or files, reply with: UNSAFE
- If unsafe or unsupported, reply with exactly: UNSAFE`;

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ALLOWED_COMMANDS = new Set([
  "dir","echo","cd","cls","type","copy","move","del","mkdir","rmdir","md","rd",
  "ren","rename","attrib","find","findstr","sort","more","tree","vol","label",
  "ver","date","time","set","path","pause","exit","ping","ipconfig","netstat",
  "tracert","nslookup","hostname","arp","route","net","systeminfo","tasklist",
  "fc","comp","xcopy","robocopy","where","whoami","assoc","ftype","color","title",
  "mode","clip","timeout","w32tm","chdir","pushd","popd","call","start","help",
]);

function isDangerous(command) {
  return DANGEROUS_PATTERNS.some((pattern) => pattern.test(command));
}

function isAllowedCommand(command) {
  const base = command.trim().split(/\s+/)[0].toLowerCase().replace(/\.exe$/i, "");
  return ALLOWED_COMMANDS.has(base);
}

function cleanCommand(raw) {
  return raw
    .trim()
    .replace(/```(?:cmd|bash|shell)?\n?/gi, "")
    .replace(/```/g, "")
    .trim();
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// Generate command from natural language
app.post("/api/generate", async (req, res) => {
  const { input } = req.body;

  if (!input || !input.trim()) {
    return res.status(400).json({ error: "Input is required." });
  }

  try {
    const response = await axios.post(OLLAMA_URL, {
      model: MODEL,
      prompt: `${SYSTEM_PROMPT}\n\nUser request: ${input}`,
      stream: false,
    });

    const command = cleanCommand(response.data.response);

    if (!command || command.toUpperCase() === "UNSAFE") {
      return res.json({ safe: false, reason: "AI flagged this as unsafe." });
    }

    if (isDangerous(command)) {
      return res.json({ safe: false, reason: "Blocked: dangerous command detected.", command });
    }

    if (!isAllowedCommand(command)) {
      return res.json({ safe: false, reason: `Blocked: "${command.split(" ")[0]}" is not a recognized built-in CMD command.`, command });
    }

    return res.json({ safe: true, command });
  } catch (err) {
    return res.status(500).json({ error: "Failed to reach Ollama. Is it running?" });
  }
});

// Execute a confirmed command
app.post("/api/execute", (req, res) => {
  const { command } = req.body;

  if (!command || !command.trim()) {
    return res.status(400).json({ error: "Command is required." });
  }

  if (isDangerous(command)) {
    return res.status(403).json({ error: "Blocked: dangerous command." });
  }

  try {
    const safeCommand = /^time\s*$/i.test(command.trim()) ? "echo %time%" : command;
    const output = execSync(safeCommand, { encoding: "utf8", shell: "cmd.exe", timeout: 10000, input: "\n" });
    return res.json({ success: true, output: output || "(no output)" });
  } catch (err) {
    return res.status(500).json({ success: false, output: err.stderr || err.message });
  }
});

const MULTI_STEP_PROMPT = `You are a Windows CMD command planner.
The user will describe a multi-step task in plain English.
Rules:
- Break the task into sequential steps
- Reply with ONLY a valid JSON array, no explanation, no markdown
- Each item: {"description": "short label", "command": "raw CMD command"}
- Only use built-in Windows CMD commands (dir, echo, mkdir, copy, move, ping, ipconfig, etc.)
- Never use interactive commands, scripts, .exe files, or internet-dependent commands
- If a step is unsafe or impossible, use: {"description": "...", "command": "UNSAFE"}
- Example: [{"description":"Create folder","command":"mkdir myproject"},{"description":"Show folder","command":"dir myproject"}]`;

// Generate multi-step commands
app.post("/api/generate-steps", async (req, res) => {
  const { input } = req.body;

  if (!input || !input.trim()) {
    return res.status(400).json({ error: "Input is required." });
  }

  try {
    const response = await axios.post(OLLAMA_URL, {
      model: MODEL,
      prompt: `${MULTI_STEP_PROMPT}\n\nUser request: ${input}`,
      stream: false,
    });

    let raw = response.data.response.trim();

    // Strip markdown code blocks if present
    raw = raw.replace(/```(?:json)?\n?/gi, "").replace(/```/g, "").trim();

    // Extract JSON array
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) {
      return res.status(500).json({ error: "AI did not return a valid step list. Try rephrasing." });
    }

    let steps;
    try {
      steps = JSON.parse(match[0]);
    } catch {
      return res.status(500).json({ error: "Failed to parse AI response. Try rephrasing." });
    }

    // Validate each step
    const validated = steps.map((step) => {
      const cmd = (step.command || "").trim();
      if (!cmd || cmd.toUpperCase() === "UNSAFE") {
        return { description: step.description, command: cmd, safe: false, reason: "AI flagged as unsafe." };
      }
      if (isDangerous(cmd)) {
        return { description: step.description, command: cmd, safe: false, reason: "Blocked: dangerous command." };
      }
      if (!isAllowedCommand(cmd)) {
        return { description: step.description, command: cmd, safe: false, reason: `Blocked: "${cmd.split(" ")[0]}" is not a recognized CMD command.` };
      }
      return { description: step.description, command: cmd, safe: true };
    });

    return res.json({ steps: validated });
  } catch (err) {
    return res.status(500).json({ error: "Failed to reach Ollama. Is it running?" });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n  AI-CMD Web UI running at http://localhost:${PORT}\n`);
});
