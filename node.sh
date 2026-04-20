#!/bin/bash
# =============================================================================
# node.sh — GZMO Edge Node CLI
# =============================================================================
# Single entrypoint for all edge-node operations.
#
# Usage:
#   ./node.sh              Show status dashboard
#   ./node.sh logs [N]     Show last N log lines (default: 50)
#   ./node.sh restart      Restart the stack
#   ./node.sh sync         Sync chaos-engine source → container
#   ./node.sh shell        Open shell in container
#   ./node.sh chaos        Show Chaos Engine state
#   ./node.sh research     Show research budget
#   ./node.sh stop         Stop the stack
#   ./node.sh start        Start the stack
# =============================================================================

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

CONTAINER="edgenode-openclaw"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
DIM='\033[2m'
BOLD='\033[1m'
NC='\033[0m'

# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────

is_running() {
  docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q "true"
}

container_uptime() {
  local started
  started=$(docker inspect -f '{{.State.StartedAt}}' "$CONTAINER" 2>/dev/null)
  if [ -z "$started" ]; then echo "—"; return; fi
  local start_epoch now_epoch diff
  start_epoch=$(date -d "$started" +%s 2>/dev/null || echo 0)
  now_epoch=$(date +%s)
  diff=$((now_epoch - start_epoch))
  if [ "$diff" -ge 86400 ]; then
    echo "$((diff / 86400))d $((diff % 86400 / 3600))h"
  elif [ "$diff" -ge 3600 ]; then
    echo "$((diff / 3600))h $((diff % 3600 / 60))m"
  else
    echo "$((diff / 60))m $((diff % 60))s"
  fi
}

container_memory() {
  docker stats "$CONTAINER" --no-stream --format "{{.MemUsage}}" 2>/dev/null || echo "—"
}

# ─────────────────────────────────────────────────────────────
# Commands
# ─────────────────────────────────────────────────────────────

cmd_status() {
  echo ""
  echo -e "  ${BOLD}╔══════════════════════════════════════════════════╗${NC}"
  echo -e "  ${BOLD}║       GZMO EDGE NODE — Status Dashboard         ║${NC}"
  echo -e "  ${BOLD}╚══════════════════════════════════════════════════╝${NC}"
  echo ""

  # ── Container Health ──
  if is_running; then
    local uptime mem
    uptime=$(container_uptime)
    mem=$(container_memory)
    echo -e "  ${GREEN}●${NC} Container    ${GREEN}running${NC}  (uptime: ${uptime})"
    echo -e "  ${DIM}  Memory:      ${mem}${NC}"
  else
    echo -e "  ${RED}●${NC} Container    ${RED}stopped${NC}"
    echo ""
    echo -e "  ${DIM}Run ./node.sh start to launch${NC}"
    return
  fi

  # ── Chaos Engine State ──
  echo ""
  local chaos_json
  chaos_json=$(docker exec "$CONTAINER" cat /workspace/CHAOS_STATE.json 2>/dev/null || echo "")
  if [ -n "$chaos_json" ]; then
    local tension energy phase tick
    tension=$(echo "$chaos_json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f\"{d['tension']:.1f}\")" 2>/dev/null || echo "?")
    energy=$(echo "$chaos_json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f\"{d['energy']:.1f}\")" 2>/dev/null || echo "?")
    phase=$(echo "$chaos_json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['phase'])" 2>/dev/null || echo "?")
    tick=$(echo "$chaos_json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['tick'])" 2>/dev/null || echo "?")
    echo -e "  ${CYAN}◆${NC} Chaos Engine ${CYAN}active${NC}"
    echo -e "    Tension: ${tension}  Energy: ${energy}  Phase: ${phase}  Tick: ${tick}"
  else
    echo -e "  ${YELLOW}◆${NC} Chaos Engine ${YELLOW}no state yet${NC}"
  fi

  # ── Research Budget ──
  local budget_json
  budget_json=$(docker exec "$CONTAINER" cat /workspace/RESEARCH_BUDGET.json 2>/dev/null || echo "")
  if [ -n "$budget_json" ]; then
    local spent cap
    spent=$(echo "$budget_json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('dailySpent',0))" 2>/dev/null || echo "0")
    cap=$(echo "$budget_json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('dailyCap',15000))" 2>/dev/null || echo "15000")
    echo -e "    Research:  ${spent}/${cap} tokens today"
  fi

  # ── Last Triggers ──
  echo ""
  local triggers
  triggers=$(docker exec "$CONTAINER" tail -5 /workspace/CHAOS_TRIGGERS.log 2>/dev/null || echo "")
  if [ -n "$triggers" ]; then
    echo -e "  ${DIM}── Recent Triggers ──${NC}"
    echo "$triggers" | while IFS= read -r line; do
      echo -e "  ${DIM}  ${line}${NC}"
    done
  fi

  # ── GPU ──
  if command -v nvidia-smi &>/dev/null; then
    echo ""
    local gpu_info
    gpu_info=$(nvidia-smi --query-gpu=name,memory.used,memory.total,utilization.gpu --format=csv,noheader 2>/dev/null || echo "")
    if [ -n "$gpu_info" ]; then
      echo -e "  ${DIM}── GPU ──${NC}"
      echo -e "  ${DIM}  ${gpu_info}${NC}"
    fi
  fi

  echo ""
}

cmd_logs() {
  local lines="${1:-50}"
  docker logs "$CONTAINER" --tail "$lines" 2>&1
}

cmd_restart() {
  echo -e "${CYAN}[node]${NC} Restarting edge-node..."
  docker compose restart
  echo -e "${GREEN}[node]${NC} Restarted. Waiting for boot..."
  sleep 8
  cmd_status
}

cmd_stop() {
  echo -e "${CYAN}[node]${NC} Stopping edge-node..."
  docker compose down --remove-orphans
  echo -e "${GREEN}[node]${NC} Stopped."
}

cmd_start() {
  echo -e "${CYAN}[node]${NC} Starting edge-node..."
  docker compose up -d
  echo -e "${GREEN}[node]${NC} Started. Waiting for boot..."
  sleep 12
  cmd_status
}

cmd_sync() {
  echo -e "${CYAN}[node]${NC} Syncing chaos-engine source → container..."
  docker cp extensions/chaos-engine/src/. "$CONTAINER":/root/.openclaw/extensions/chaos-engine/src/
  docker exec "$CONTAINER" chown -R root:root /root/.openclaw/extensions/chaos-engine/
  echo -e "${GREEN}[node]${NC} Files synced. Clearing JITI cache..."
  docker exec "$CONTAINER" rm -rf /tmp/jiti 2>/dev/null || true
  echo -e "${GREEN}[node]${NC} Done. Run ${BOLD}./node.sh restart${NC} to load changes."
}

cmd_shell() {
  docker exec -it "$CONTAINER" sh
}

cmd_chaos() {
  local chaos_json
  chaos_json=$(docker exec "$CONTAINER" cat /workspace/CHAOS_STATE.json 2>/dev/null || echo "{}")
  echo "$chaos_json" | python3 -m json.tool 2>/dev/null || echo "$chaos_json"
}

cmd_research() {
  local budget_json
  budget_json=$(docker exec "$CONTAINER" cat /workspace/RESEARCH_BUDGET.json 2>/dev/null || echo "{}")
  echo "$budget_json" | python3 -m json.tool 2>/dev/null || echo "$budget_json"
}

cmd_help() {
  echo ""
  echo -e "  ${BOLD}GZMO Edge Node CLI${NC}"
  echo ""
  echo "  Usage: ./node.sh <command> [args]"
  echo ""
  echo "  Commands:"
  echo "    (none)       Show status dashboard"
  echo "    logs [N]     Show last N log lines (default: 50)"
  echo "    restart      Restart the stack"
  echo "    start        Start the stack"
  echo "    stop         Stop the stack"
  echo "    sync         Sync chaos-engine source → container"
  echo "    shell        Open shell in container"
  echo "    chaos        Show Chaos Engine JSON state"
  echo "    research     Show research budget JSON"
  echo "    help         Show this help"
  echo ""
}

# ─────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────

case "${1:-}" in
  ""|status)  cmd_status ;;
  logs)       cmd_logs "${2:-50}" ;;
  restart)    cmd_restart ;;
  stop)       cmd_stop ;;
  start)      cmd_start ;;
  sync)       cmd_sync ;;
  shell)      cmd_shell ;;
  chaos)      cmd_chaos ;;
  research)   cmd_research ;;
  help|-h|--help) cmd_help ;;
  *)
    echo -e "${RED}Unknown command: $1${NC}"
    cmd_help
    exit 1
    ;;
esac
