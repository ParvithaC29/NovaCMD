const axios = require("axios");
const readlineSync = require("readline-sync");
const { execSync } = require("child_process");

// ─── Config ───────────────────────────────────────────────────────────────────

const OLLAMA_URL = "http://localhost:11434/api/generate";
const MODEL = "qwen2.5:1.5b";

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
  /:(){ :|:& };:/,       // fork bomb
  />\s*(\/dev\/sda|[a-z]:)/i,
];

const SYSTEM_PROMPT = `You are a Windows CMD command generator.
The user will describe what they want to do in plain English.
Rules:
- Reply with ONLY the raw Windows CMD command
- No explanation, no markdown, no backticks, no code blocks
- Just the plain command text, nothing else
- If unsafe or unsupported, reply with exactly: UNSAFE`;

// ─── Safety ───────────────────────────────────────────────────────────────────

function isDangerous(command) {
  return DANGEROUS_PATTERNS.some((pattern) => pattern.test(command));
}

function confirmExecution(command) {
  console.log("\n┌─────────────────────────────────────────");
  console.log("│ Generated command:");
  console.log(`│   ${command}`);
  console.log("└─────────────────────────────────────────");
  const answer = readlineSync.question("\nExecute this command? (yes/no): ");
  return answer.trim().toLowerCase() === "yes";
}

// ─── Ollama ───────────────────────────────────────────────────────────────────

async function generateCommand(userInput) {
  const response = await axios.post(OLLAMA_URL, {
    model: MODEL,
    prompt: `${SYSTEM_PROMPT}\n\nUser request: ${userInput}`,
    stream: false,
  });

  return response.data.response
    .trim()
    .replace(/```(?:cmd|bash|shell)?\n?/gi, "")
    .replace(/```/g, "")
    .trim();
}

// ─── Execution ────────────────────────────────────────────────────────────────

function executeCommand(command) {
  try {
    const output = execSync(command, { encoding: "utf8", shell: "cmd.exe" });
    console.log("\n✔ Output:\n");
    console.log(output || "(no output)");
  } catch (err) {
    console.error("\n✖ Command failed:\n");
    console.error(err.stderr || err.message);
  }
}

// ─── Main Loop ────────────────────────────────────────────────────────────────

async function main() {
  console.log("===========================================");
  console.log("  AI → CMD  |  Powered by Ollama llama3  ");
  console.log("===========================================");
  console.log('Type your request in plain English. Type "exit" to quit.\n');

  while (true) {
    const userInput = readlineSync.question("You: ").trim();

    if (!userInput) continue;
    if (userInput.toLowerCase() === "exit") {
      console.log("Goodbye.");
      break;
    }

    console.log("\n⏳ Thinking...");

    let command;
    try {
      command = await generateCommand(userInput);
    } catch (err) {
      console.error("✖ Failed to reach Ollama:", err.message);
      console.error("  Make sure Ollama is running: ollama serve");
      continue;
    }

    if (!command || command.toUpperCase() === "UNSAFE") {
      console.log("⚠ The AI flagged this request as unsafe or unsupported.");
      continue;
    }

    if (isDangerous(command)) {
      console.log(`\n🚫 Blocked — dangerous command detected:\n   ${command}`);
      continue;
    }

    const confirmed = confirmExecution(command);
    if (!confirmed) {
      console.log("↩ Skipped.\n");
      continue;
    }

    executeCommand(command);
    console.log();
  }
}

main();
