# Edge Node Offline-Sovereign Agent Build
# Meets "Absolute Minimalism" by stripping everything not strictly required.
# Using bookworm-slim instead of alpine: sqlite-vec requires glibc (__memcpy_chk).
# Alpine's musl causes "symbol not found" on the pre-compiled .so bindings.
FROM node:22-bookworm-slim

# Add build tools for native node modules + qmd's node-llama-cpp dependency
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ cmake git && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# The "Zero-Dependecy Runtime" Protocol:
# We invoke npm install ONLY during the docker build phase, burning the binary into the image.
# This guarantees that if the server loses internet access, the container can still boot and run the local AI models.
# HARD PINNED to avoid bleeding edge breakage
RUN npm install -g openclaw@2026.4.2 @tobilu/qmd@2.1.0 && \
    cd /usr/local/lib/node_modules/openclaw && \
    npm install grammy @grammyjs/runner @grammyjs/transformer-throttler @grammyjs/types

# GZMO Chaos Engine — baked into the image for offline resilience
COPY extensions/chaos-engine/ /opt/chaos-engine/

# Vault Janitor + maintenance scripts — invoked by Chaos Engine autonomous pulse
COPY scripts/ /opt/chaos-engine/scripts/

# Startup script:
# 1. Install chaos-engine plugin into mounted config dir
# 2. Symlink @openclaw/plugin-sdk so external plugins can resolve it
# 3. Launch gateway
COPY openclaw-build/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

ENTRYPOINT ["/app/entrypoint.sh"]
