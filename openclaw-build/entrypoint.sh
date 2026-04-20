#!/bin/sh
set -e

OPENCLAW_SDK="/usr/local/lib/node_modules/openclaw/dist/plugin-sdk"
PLUGIN_DIR="/root/.openclaw/extensions/chaos-engine"

# ── 1. Install plugin if not already present ──
if [ -d /opt/chaos-engine ] && [ ! -d "$PLUGIN_DIR" ]; then
  echo "[INIT] Installing Chaos Engine plugin..."
  openclaw plugins install /opt/chaos-engine 2>&1 || true
fi

# ── 2. Symlink @openclaw/plugin-sdk into plugin's node_modules ──
#    External plugins can't resolve the SDK because they're outside
#    openclaw's package tree. This symlink fixes module resolution.
if [ -d "$PLUGIN_DIR" ] && [ -d "$OPENCLAW_SDK" ]; then
  mkdir -p "$PLUGIN_DIR/node_modules/@openclaw"
  ln -sfn "$OPENCLAW_SDK" "$PLUGIN_DIR/node_modules/@openclaw/plugin-sdk"
  # Ensure plugin files are root-owned (prevents 'suspicious ownership' block)
  chown -R root:root "$PLUGIN_DIR" 2>/dev/null || true
  echo "[INIT] Chaos Engine SDK symlink created"
fi

# ── 3. Clear jiti transpile cache (ensures latest .ts changes are compiled) ──
rm -rf /tmp/jiti 2>/dev/null || true

# ── 4. Launch the gateway ──
echo "[INIT] Starting OpenClaw gateway..."
exec openclaw gateway run "$@"
