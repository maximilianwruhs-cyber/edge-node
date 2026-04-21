# tinyFolder 📂 – Exam & Reviewer Guide

> **The most minimalistic autonomous AI OS.**  
> *A project demonstrating true local autonomy, allostatic stress simulation, and self-documenting RAG architecture inside a plain text folder.*

Welcome to the **tinyFolder** Edge Node evaluation. 

This project explores the illusion of simplicity. On the outside, it is just a normal folder syncing markdown files. On the inside lives **GZMO**, an autonomous daemon serving as the ghost in the machine. It reads markdown files, maintains a chaos-driven heartbeat, and builds a searchable wiki of its own memories.

## 1. Quick Start (Running from this USB Stick)

The project is designed to run entirely offline from this USB drive. The dependencies (`node_modules`), the database (`Obsidian_Vault`), and the AI models (`ollama_models`) are fully packaged on the stick.

**Prerequisites:**
You need to have installed on your machine:
- **Bun** (for the JavaScript runtime)
- **Ollama** (for local AI inference)

### Booting the Environment

Open a terminal in the root directory of this USB stick and run:

```bash
# 1. Point Ollama to the models folder on this stick (Hermes3:8b and Nomic)
export OLLAMA_MODELS="$PWD/ollama_models"

# 2. Start the local Ollama Server in the background
ollama serve &
```

*(Ensure Ollama says "Listening on 127.0.0.1:11434" before continuing).*

### Running the 8-Stage Gauntlet (Stress Test)

The project includes an exhaustive 8-stage automated stress test that evaluates GZMO's core capabilities (Identity Compliance, RAG Vault Search, Task Chaining, Dream Distillation, Self-Ask, Wiki Autonomy, and Chaos State Integrity).

```bash
# 3. Enter the daemon directory
cd edge-node/gzmo-daemon

# 4. Run the ultimate stress test
bun run test_hermes3_stress.ts
```
*The test will output a beautiful terminal UI showing the success metrics for all 8 stages, and save a full markdown report into `Obsidian_Vault/GZMO/hermes3_stress_report.md`.*

---

## 2. Using the OS Manually (Interactive Mode)

If you wish to test the daemon interactively rather than running the automated gauntlet:

**A. Summon the Daemon:**
```bash
cd edge-node/gzmo-daemon
bun run summon
```
You will see the daemon's heartbeat (PulseLoop) starting at 174 BPM.

**B. Give it a Task:**
tinyFolder doesn't have a chat interface. It lives in the file system. 
1. Open the folder `Obsidian_Vault/GZMO/Inbox/`
2. Create a text file called `hello_gzmo.md`
3. Paste the following text into it and save:

```yaml
---
status: pending
action: think
---

Hello GZMO! Briefly explain your chaos engine to me.
```

**C. Watch the Magic:**
Within 1-2 seconds, the daemon will detect the file. Check the terminal to watch it process. Open `hello_gzmo.md` again—your answer will be appended at the bottom!

---

## 3. Notable Autonomous Features for Evaluation

If you leave the daemon running (via `bun run summon`), it will autonomously execute these subsystems:

- **The Chaos Engine (`src/pulse.ts` & `src/chaos.ts`)**: A coupled Lorenz Attractor and Logistic Map running in real-time. It simulates the daemon's "mood" (Tension and Energy). 
- **The Dream Engine (`src/dreams.ts`)**: Every ~30 minutes, it reflects on recently completed tasks and distills new philosophical insights ("Dreams").
- **The Wiki Engine (`src/wiki_engine.ts`)**: It periodically analyzes source code and auto-generates architectural documentation about itself (`wiki/entities/GZMO-Architecture-AutoDoc.md`), which it then integrates into its RAG context.
- **RAG Architecture (`src/embeddings.ts`)**: You can set `action: search` in the frontmatter of an Inbox file to make GZMO read from its Obsidian Vault before answering.

Good luck with the evaluation! 🚀
