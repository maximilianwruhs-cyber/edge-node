#!/bin/bash
set -e

echo "🦞 Bootstrapping Edge Node (Production Hardened)..."

# 1. Verification
if [ ! -f ".env" ]; then
    echo "⚠️  No .env file found! Copying .env.example..."
    cp .env.example .env
    echo "❌ Please edit .env with your actual API keys and re-run deploy.sh"
    exit 1
fi

set -a
source .env
set +a

if [ ! -f "${MODELS_DIR}/${MODEL_FILENAME}" ]; then
    echo "❌ FATAL: Pre-flight failure. The physical AI model file was not found!"
    echo "Expected path: ${MODELS_DIR}/${MODEL_FILENAME}"
    echo "Please provide the .gguf model or update your .env before booting."
    exit 1
fi

# 2. Flush Legacy V2 Daemons
echo "[1/4] Flushing Legacy DevStack/AOS Daemons..."
systemctl --user stop aos-engine.service 2>/dev/null || true
systemctl --user stop openclaw-gateway.service 2>/dev/null || true
fuser -k 1238/tcp 2>/dev/null || true
fuser -k 1239/tcp 2>/dev/null || true
killall -9 ollama 2>/dev/null || true
killall -9 llama-server 2>/dev/null || true

# 3. Atomic Teardown
echo "[2/4] Executing Graceful Container Teardown..."
docker compose down --remove-orphans || true

# 4. Bootstrapping Edge Node Declarative Core
echo "[3/4] Standing up Immutable Docker Architecture..."
docker compose up -d --build

echo "[4/4] Edge Node is LIVE."
echo "✅ PGVector Backbone Active on :5432"
echo "✅ Speculative Coder (Flash Attention) Active on :1238"
echo "✅ OpenClaw Gateway connecting to Telegram (Offline Immutable Boot)"
