#!/bin/bash
# =============================================================================
# install_node.sh — GZMO Edge Node Auto-Setup Wizard
# =============================================================================
# Hardware-adaptive sovereign agent deployment.
# Supports Gemini Cloud (default) and Ollama Local inference modes.
#
# Heritage:
#   - Hardware sensing: phantom-drive/scripts/boot.sh (PCI ID hex-matching)
#   - Agent stack:      edge-node/deploy.sh + init-secrets.sh (merged here)
#
# Usage:
#   ./install_node.sh              # Interactive setup
#   ./install_node.sh --dry-run    # Show what would be configured, don't deploy
#   ./install_node.sh --reconfigure # Re-run config generation (keep existing secrets)
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Colors (from phantom-drive)
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log()  { echo -e "${CYAN}[edge-node]${NC} $*"; }
warn() { echo -e "${YELLOW}[edge-node]${NC} $*"; }
err()  { echo -e "${RED}[edge-node]${NC} $*" >&2; }
ok()   { echo -e "${GREEN}[edge-node]${NC} $*"; }

DRY_RUN=false
RECONFIGURE=false
for arg in "$@"; do
    case "$arg" in
        --dry-run) DRY_RUN=true ;;
        --reconfigure) RECONFIGURE=true ;;
    esac
done

# =============================================================================
# Phase 1: Hardware Detection (from phantom-drive boot.sh)
# =============================================================================

detect_gpu_arch() {
    local pci_id
    pci_id=$(lspci -nn 2>/dev/null | grep -i nvidia | grep -oP '\[10de:\K[0-9a-f]{4}' | head -1)
    if [ -z "$pci_id" ]; then
        echo "none"
        return
    fi
    local dev_dec=$((16#${pci_id}))

    if [ "$dev_dec" -ge $((16#2900)) ]; then
        echo "blackwell"
    elif [ "$dev_dec" -ge $((16#2600)) ]; then
        echo "ada"
    elif [ "$dev_dec" -ge $((16#2200)) ]; then
        echo "ampere"
    elif [ "$dev_dec" -ge $((16#1e00)) ]; then
        echo "turing"
    elif [ "$dev_dec" -ge $((16#1b00)) ]; then
        echo "pascal"
    elif [ "$dev_dec" -ge $((16#1380)) ]; then
        echo "maxwell"
    else
        echo "pre-maxwell"
    fi
}

get_gpu_name() {
    nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1 || echo "None"
}

get_cuda_cc() {
    nvidia-smi --query-gpu=compute_cap --format=csv,noheader 2>/dev/null | head -1 || echo "—"
}

get_available_vram_mb() {
    nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits 2>/dev/null | head -1 || echo "0"
}

get_available_ram_mb() {
    free -m | awk '/Mem:/{print $7}'
}

# =============================================================================
# Phase 2: Model Selection (VRAM-adaptive, only for Ollama mode)
# =============================================================================

select_model() {
    local vram="$1"

    if [ "$vram" -ge 24000 ]; then
        echo "qwen3:235b-a22b"
    elif [ "$vram" -ge 16000 ]; then
        echo "qwen2.5:14b"
    elif [ "$vram" -ge 10000 ]; then
        echo "qwen2.5:7b"
    elif [ "$vram" -ge 6000 ]; then
        echo "qwen2.5:3b"
    elif [ "$vram" -ge 3000 ]; then
        echo "phi4-mini:3.8b"
    else
        echo "phi4-mini:3.8b"
    fi
}

get_model_context() {
    local model="$1"
    case "$model" in
        qwen3:235b-a22b)  echo 131072 ;;
        qwen2.5:14b)      echo 131072 ;;
        qwen2.5:7b)       echo 131072 ;;
        qwen2.5:3b)       echo 32768 ;;
        phi4-mini:3.8b)   echo 16384 ;;
        *)                echo 32768 ;;
    esac
}

# =============================================================================
# Phase 3: Interactive Configuration
# =============================================================================

prompt_value() {
    local prompt_text="$1"
    local default_value="${2:-}"
    local current_value="${3:-}"

    if [ -n "$current_value" ] && [ "$current_value" != "$default_value" ]; then
        echo "$current_value"
        return
    fi

    local input
    if [ -n "$default_value" ]; then
        read -rp "  ${prompt_text} [${default_value}]: " input
        echo "${input:-$default_value}"
    else
        while true; do
            read -rp "  ${prompt_text}: " input
            if [ -n "$input" ]; then
                echo "$input"
                return
            fi
            warn "  This value is required."
        done
    fi
}

prompt_optional() {
    local prompt_text="$1"
    local current_value="${2:-}"

    if [ -n "$current_value" ]; then
        echo "$current_value"
        return
    fi

    local input
    read -rp "  ${prompt_text} (press Enter to skip): " input
    echo "$input"
}

load_existing_env() {
    if [ -f ".env" ]; then
        set -a
        source .env 2>/dev/null || true
        set +a
    fi
}

generate_token() {
    openssl rand -hex 24 2>/dev/null || head -c 48 /dev/urandom | xxd -p 2>/dev/null || python3 -c "import secrets; print(secrets.token_hex(24))"
}

# =============================================================================
# Phase 4: Config Generation
# =============================================================================

generate_env() {
    local vault_path="$1"
    local telegram_token="$2"
    local gemini_key="$3"
    local openrouter_key="$4"
    local serpapi_key="$5"

    # Preserve or generate auth token
    local auth_token="${OPENCLAW_AUTH_TOKEN:-}"
    if [ -z "$auth_token" ] || [ "$RECONFIGURE" = false ]; then
        auth_token=$(generate_token)
    fi

    cat > .env << EOF
# ============================================================
# GZMO Edge-Node — Environment Configuration
# ============================================================
# Generated by install_node.sh on $(date -Iseconds)
# ============================================================

# ── Paths ──
OBSIDIAN_VAULT_PATH=${vault_path}

# ── API Keys ──
GEMINI_API_KEY=${gemini_key}
OPENROUTER_API_KEY=${openrouter_key}
SERPAPI_API_KEY=${serpapi_key}
TELEGRAM_BOT_TOKEN=${telegram_token}

# ── Internal Security ──
OPENCLAW_AUTH_TOKEN=${auth_token}
EOF

    ok "Generated .env"
}

generate_openclaw_config_gemini() {
    local gemini_key="$1"
    local auth_token="$2"

    mkdir -p config

    cat > config/openclaw.json << EOF
{
  "\$schema": "https://docs.openclaw.ai/schema.json",
  "gateway": {
    "mode": "local",
    "auth": {
      "mode": "token",
      "token": "${auth_token}"
    }
  },
  "models": {
    "providers": {
      "gemini": {
        "apiKey": "${gemini_key}",
        "models": [
          {
            "id": "gemini-2.5-flash",
            "name": "Gemini 2.5 Flash (Cloud)"
          }
        ]
      }
    }
  },
  "agents": {
    "defaults": {
      "workspace": "/workspace/core_identity",
      "model": "gemini/gemini-2.5-flash"
    }
  },
  "channels": {
    "telegram": {
      "enabled": true,
      "dmPolicy": "pairing",
      "groupPolicy": "disabled"
    }
  },
  "mcp": {
    "servers": {
      "obsidian-vault": {
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-filesystem", "/workspace/Obsidian_Vault"]
      },
      "qmd-search": {
        "command": "qmd",
        "args": ["mcp"]
      }
    }
  },
  "plugins": {
    "entries": {
      "acpx": {
        "enabled": true
      }
    }
  }
}
EOF

    ok "Generated config/openclaw.json (Gemini 2.5 Flash)"
}

generate_openclaw_config_ollama() {
    local model="$1"
    local context_window="$2"
    local auth_token="$3"

    mkdir -p config

    cat > config/openclaw.json << EOF
{
  "\$schema": "https://docs.openclaw.ai/schema.json",
  "gateway": {
    "mode": "local",
    "auth": {
      "mode": "token",
      "token": "${auth_token}"
    }
  },
  "models": {
    "providers": {
      "ollama-local": {
        "baseUrl": "http://127.0.0.1:11434/v1",
        "apiKey": "ollama",
        "api": "openai-responses",
        "models": [
          {
            "id": "${model}",
            "name": "${model} (Ollama)",
            "contextWindow": ${context_window}
          }
        ]
      }
    }
  },
  "agents": {
    "defaults": {
      "workspace": "/workspace/core_identity",
      "model": "ollama-local/${model}"
    }
  },
  "channels": {
    "telegram": {
      "enabled": true,
      "dmPolicy": "pairing",
      "groupPolicy": "disabled"
    }
  },
  "mcp": {
    "servers": {
      "obsidian-vault": {
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-filesystem", "/workspace/Obsidian_Vault"]
      },
      "qmd-search": {
        "command": "qmd",
        "args": ["mcp"]
      }
    }
  },
  "plugins": {
    "entries": {
      "acpx": {
        "enabled": true
      }
    }
  }
}
EOF

    ok "Generated config/openclaw.json (Ollama: ${model}, ctx: ${context_window})"
}

# =============================================================================
# Phase 5: Deploy
# =============================================================================

deploy_stack() {
    local inference_mode="$1"
    local ollama_model="${2:-}"

    log "Flushing legacy daemons..."
    systemctl --user stop aos-engine.service 2>/dev/null || true
    systemctl --user stop openclaw-gateway.service 2>/dev/null || true
    killall -9 llama-server 2>/dev/null || true

    log "Tearing down existing containers..."
    docker compose down --remove-orphans 2>/dev/null || true

    if [ "$inference_mode" = "ollama" ]; then
        log "Building and launching stack (with Ollama)..."
        docker compose --profile local up -d --build

        log "Pulling model: ${ollama_model} (this may take a while)..."
        docker exec edgenode-ollama ollama pull "$ollama_model"
        ok "Model ${ollama_model} ready."
    else
        log "Building and launching stack (Gemini Cloud)..."
        docker compose up -d --build
    fi
}

health_check() {
    local retries=0
    log "Waiting for OpenClaw Gateway..."
    while ! curl -sf http://127.0.0.1:18789/health &>/dev/null; do
        sleep 2
        retries=$((retries + 1))
        if [ $retries -ge 30 ]; then
            warn "Gateway not responding after 60s — check logs: docker logs edgenode-openclaw"
            return 1
        fi
    done
    ok "Gateway healthy."
    return 0
}

# =============================================================================
# Main
# =============================================================================

main() {
    echo ""
    echo -e "  ${BOLD}╔══════════════════════════════════════════════╗${NC}"
    echo -e "  ${BOLD}║   GZMO EDGE NODE — Sovereign Agent Setup    ║${NC}"
    echo -e "  ${BOLD}╚══════════════════════════════════════════════╝${NC}"
    echo ""

    # ── Hardware Probe ──
    log "Probing hardware..."
    local gpu_arch gpu_name vram_mb cuda_cc ram_mb
    gpu_arch=$(detect_gpu_arch)
    gpu_name=$(get_gpu_name)
    vram_mb=$(get_available_vram_mb)
    cuda_cc=$(get_cuda_cc)
    ram_mb=$(get_available_ram_mb)

    echo ""
    if [ "$gpu_arch" = "none" ]; then
        warn "No NVIDIA GPU detected."
    else
        ok "GPU:  ${gpu_name} (${gpu_arch}, CC ${cuda_cc}, ${vram_mb} MB VRAM)"
    fi
    ok "RAM:  ${ram_mb} MB (available)"
    echo ""

    # ── Inference Mode Selection ──
    echo -e "  ${BOLD}Select inference mode:${NC}"
    echo "    1) Gemini Cloud  (recommended — uses Gemini 2.5 Flash API)"
    echo "    2) Ollama Local  (requires NVIDIA GPU + Container Toolkit)"
    echo ""
    local mode_choice
    read -rp "  Choice [1]: " mode_choice
    local inference_mode="gemini"
    if [ "$mode_choice" = "2" ]; then
        inference_mode="ollama"
    fi

    local selected_model="" context_window=""

    if [ "$inference_mode" = "ollama" ]; then
        # ── Ollama Model Selection ──
        if [ "$gpu_arch" = "none" ]; then
            warn "No GPU detected — Ollama will use CPU only (slow)."
        fi
        selected_model=$(select_model "$vram_mb")
        context_window=$(get_model_context "$selected_model")
        ok "Recommended model: ${BOLD}${selected_model}${NC} (ctx: ${context_window})"
        echo ""
        local custom_model
        read -rp "  Accept this model? (Enter = yes, or type a different model): " custom_model
        if [ -n "$custom_model" ]; then
            selected_model="$custom_model"
            context_window=$(get_model_context "$selected_model")
            log "Using custom model: ${selected_model}"
        fi
    else
        ok "Using Gemini 2.5 Flash (Cloud API)"
    fi

    # ── Load existing config ──
    load_existing_env

    # ── Interactive Config ──
    echo ""
    log "Configuration (press Enter to keep existing values):"
    echo ""

    local vault_path telegram_token gemini_key openrouter_key serpapi_key

    vault_path=$(prompt_value "Path to Obsidian Vault" "" "${OBSIDIAN_VAULT_PATH:-}")
    telegram_token=$(prompt_value "Telegram Bot Token (from @BotFather)" "" "${TELEGRAM_BOT_TOKEN:-}")
    gemini_key=$(prompt_optional "Gemini API Key" "${GEMINI_API_KEY:-}")
    openrouter_key=$(prompt_optional "OpenRouter API Key" "${OPENROUTER_API_KEY:-}")
    serpapi_key=$(prompt_optional "SerpAPI Key" "${SERPAPI_API_KEY:-}")

    # ── Summary ──
    echo ""
    echo -e "  ${BOLD}── Configuration Summary ──${NC}"
    echo "  Mode:     ${inference_mode}"
    if [ "$inference_mode" = "ollama" ]; then
        echo "  GPU:      ${gpu_name} (${gpu_arch})"
        echo "  Model:    ${selected_model} (ctx: ${context_window})"
    else
        echo "  Model:    Gemini 2.5 Flash (Cloud)"
    fi
    echo "  Vault:    ${vault_path}"
    echo "  Telegram: ${telegram_token:0:10}..."
    echo ""

    if [ "$DRY_RUN" = true ]; then
        ok "DRY RUN — No changes made. Above is what would be configured."
        exit 0
    fi

    read -rp "  Deploy now? (y/N): " confirm
    if [[ ! "$confirm" =~ ^[yY] ]]; then
        warn "Aborted."
        exit 0
    fi

    # ── Generate Configs ──
    generate_env "$vault_path" "$telegram_token" "$gemini_key" "$openrouter_key" "$serpapi_key"

    source .env

    if [ "$inference_mode" = "ollama" ]; then
        generate_openclaw_config_ollama "$selected_model" "$context_window" "$OPENCLAW_AUTH_TOKEN"
    else
        generate_openclaw_config_gemini "$gemini_key" "$OPENCLAW_AUTH_TOKEN"
    fi

    # ── Deploy ──
    deploy_stack "$inference_mode" "$selected_model"

    # ── Health Check ──
    health_check

    # ── Post-Install Report ──
    echo ""
    echo -e "  ${BOLD}╔══════════════════════════════════════════════╗${NC}"
    echo -e "  ${BOLD}║          EDGE NODE IS LIVE ✅                ║${NC}"
    echo -e "  ${BOLD}╠══════════════════════════════════════════════╣${NC}"
    if [ "$inference_mode" = "ollama" ]; then
        echo -e "  ${BOLD}║${NC}  Mode:     Ollama Local"
        echo -e "  ${BOLD}║${NC}  GPU:      ${gpu_name} (${gpu_arch})"
        echo -e "  ${BOLD}║${NC}  Model:    ${selected_model}"
        echo -e "  ${BOLD}║${NC}  Ollama:   http://127.0.0.1:11434"
    else
        echo -e "  ${BOLD}║${NC}  Mode:     Gemini Cloud"
        echo -e "  ${BOLD}║${NC}  Model:    Gemini 2.5 Flash"
    fi
    echo -e "  ${BOLD}║${NC}  Gateway:  http://127.0.0.1:18789"
    echo -e "  ${BOLD}║${NC}  Telegram: Active"
    echo -e "  ${BOLD}╠══════════════════════════════════════════════╣${NC}"
    echo -e "  ${BOLD}║${NC}  CLI:        ./node.sh"
    echo -e "  ${BOLD}║${NC}  Status:     ./node.sh status"
    echo -e "  ${BOLD}║${NC}  Logs:       ./node.sh logs"
    echo -e "  ${BOLD}╠══════════════════════════════════════════════╣${NC}"
    echo -e "  ${BOLD}║${NC}  Setup qmd search (optional):"
    echo -e "  ${BOLD}║${NC}    npm install -g @tobilu/qmd"
    echo -e "  ${BOLD}║${NC}    qmd collection add ${vault_path}/wiki --name wiki"
    echo -e "  ${BOLD}║${NC}    qmd embed"
    echo -e "  ${BOLD}╚══════════════════════════════════════════════╝${NC}"
    echo ""
}

main "$@"
