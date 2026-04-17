#  NovaCmd

### Speak it. Run it.

NovaCmd is an AI-powered command-line assistant that converts natural language into executable Windows CMD commands using local LLMs via Ollama.

It allows developers to interact with their terminal using plain English while maintaining safety through command validation and confirmation.

---

##  Features

*  Natural Language → CMD Commands
*  Instant command execution
*  Built-in safety system (blocks dangerous commands)
*  Confirmation before execution
*  Web interface + CLI support
*  Multi-step command planning
*  Works offline using Ollama

---

## 🛠 Tech Stack

* Node.js
* Express.js
* Axios
* Readline-sync
* Ollama (Local LLM)

---

##  Installation

```bash
git clone https://github.com/your-username/novacmd.git
cd novacmd
npm install
```

---

##  Setup Ollama

Install Ollama and pull a model:

```bash
ollama pull llama3
ollama serve
```

---

##  Run the App

### CLI Mode

```bash
node index.js
```

### Web Mode

```bash
node server.js
```

Then open:

```
http://localhost:3000
```

---

##  Example Usage

```
You: create a folder named test
AI: mkdir test

You: show all files
AI: dir
```

---

##  Safety Features

* Blocks dangerous commands (e.g., `rm -rf`, `format`, `shutdown`)
* Restricts to safe, built-in CMD commands
* Requires user confirmation before execution
* Detects unsafe AI outputs

---

##  Multi-Step Planning

NovaCmd can break down complex tasks into steps:

```
Input: create folder and list files
Output:
1. mkdir myfolder
2. dir
```

---

##  Project Structure

```
novacmd/
│── index.js       # CLI application
│── server.js      # Web server
│── package.json
│── public/        # Frontend (if applicable)
```

---

##  Future Improvements

*  Voice control integration (Nova Assistant)
*  Context-aware command suggestions
*  Cross-platform support (Linux/Mac)
*  Command history & undo feature

---

##  Author

Parvitha

---

##  Support

If you like this project, consider giving it a star ⭐ on GitHub!
# NovaCMD
AI-powered terminal assistant that converts natural language into safe Windows CMD commands using local LLMs (Ollama). Supports CLI + Web UI with built-in safety checks.
