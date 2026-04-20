#!/bin/bash

STICK="/media/maximilian-wruhs/GZMO1"

echo "==========================================="
echo " Deploying GZMO to Sovereign USB Stick"
echo "==========================================="

# Check if stick is mounted
if [ ! -d "$STICK" ]; then
    echo "ERROR: USB stick not found at $STICK"
    exit 1
fi

echo "1. Syncing GZMO Daemon (excluding node_modules)..."
rsync -av --delete --exclude "node_modules" \
      --exclude ".git" \
      /home/maximilian-wruhs/Dokumente/Playground/DevStack_v2/edge-node/ \
      "$STICK/edge-node/"

echo ""
echo "2. Syncing Obsidian Vault..."
rsync -av --delete /home/maximilian-wruhs/Dokumente/Playground/DevStack_v2/Obsidian_Vault/ \
      "$STICK/Obsidian_Vault/"

echo ""
echo "3. Syncing Ollama Models (Hermes3 & Nomic)..."
# This allows running 'OLLAMA_MODELS=/media/.../ollama_models ollama serve' portably 
rsync -av --delete /usr/share/ollama/.ollama/models/ \
      "$STICK/ollama_models/"

echo ""
echo "==========================================="
echo " DEPLOYMENT COMPLETE! 🚀"
echo "==========================================="
echo "To run from the stick on a new machine:"
echo "1. export OLLAMA_MODELS=\"\$PWD/ollama_models\""
echo "2. ollama serve"
echo "3. Update .env VAULT_PATH"
echo "4. bun start"
