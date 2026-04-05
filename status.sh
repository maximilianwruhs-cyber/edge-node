#!/bin/bash
echo "=== Edge Node Native Health Status ==="
docker compose ps
echo ""
echo "=== GPU Telemetry & VRAM ==="
nvidia-smi --query-gpu=name,memory.used,memory.total,utilization.gpu --format=csv
