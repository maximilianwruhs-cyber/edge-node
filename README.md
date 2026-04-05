# Edge Node: Sovereign Agentic AI Stack

Edge Node is a bare-metal, un-tethered, zero-trust artificial intelligence development environment. Designed for maximum hardware efficiency and complete local privacy, it allows you to run high-performance C++ inference natively alongside autonomous agent tooling without relying on external cloud APIs.

## Core Tenets
1. **Absolute Sovereignty**: No telemetry, no forced cloud accounts, no external dependencies for core inference.
2. **Immutable Infrastructure**: All dependencies are burned into the containers via Ansible and Docker. If the node loses internet access, it still boots.
3. **Hardware Maximization**: Uses `llama.cpp` compiled natively against the host's specific GPU architecture (via stub-linker injection) for maximum Flash Attention efficiency.

## Architecture

The stack consists of three hyper-optimized containers:
1. **PGVector Backbone**: Real-time vector memory for Retrieval-Augmented Generation (RAG).
2. **Llama-Coder Engine**: Native C++ inference engine using `b8665` LLAMA architecture, directly accessing host GPUs.
3. **OpenClaw Gateway**: A lightweight, offline-first agent orchestrator (Node 22) that acts as the entry point and connects to external messaging platforms like Telegram.

## Deployment

Due to its 12-factor Environment-driven architecture, `Edge Node` is universally portable. You have two options for deployment:

### Option A: Zero-Touch Bare-Metal Deploy (Ansible)
For production nodes, deploy from a control machine directly onto a virgin Ubuntu server.

1. Configure your targets in `ansible/inventory.yml`
2. Run the playbook:
```bash
ansible-playbook -i ansible/inventory.yml ansible/deploy_node.yml --ask-become-pass --ask-vault-pass
```
The playbook will automatically install Docker, Nvidia Container Toolkit, sync the codebase, securely template your `.env` secrets, download the LLMs, and ignite the stack.

### Option B: Local Quick Start
If your local machine already has Docker and the NVIDIA drivers installed:

1. Copy the environment template:
```bash
cp .env.example .env
# Edit .env with your local hardware mappings and tokens
```
2. Place your `.gguf` model in the `MODELS_DIR` defined in `.env`.
3. Launch the stack:
```bash
./deploy.sh
```

## Security & Verification

`Edge Node` operates under a zero-trust model. Ensure your `.env` is fully populated. A local `.gitignore` is included out-of-the-box to ensure your API keys and hardware paths never leak in public commits.

To check the real-time health and GPU telemetry of a running node:
```bash
./status.sh
```

## License
MIT License. See `LICENSE` for details.
