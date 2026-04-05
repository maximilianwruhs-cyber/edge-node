# Edge Node Offline-Sovereign Agent Build
# Meets "Absolute Minimalism" by stripping everything not strictly required.
FROM node:22-alpine

# Add build tools if native node modules are required by internal plugins
RUN apk add --no-cache python3 make g++

WORKDIR /app

# The "Zero-Dependecy Runtime" Protocol:
# We invoke npm install ONLY during the docker build phase, burning the binary into the image.
# This guarantees that if the server loses internet access, the container can still boot and run the local AI models.
# HARD PINNED to avoid bleeding edge breakage
RUN npm install -g openclaw@2026.4.2 && \
    cd /usr/local/lib/node_modules/openclaw && \
    npm install grammy @grammyjs/runner @grammyjs/transformer-throttler @grammyjs/types

# 100% Static Execution
ENTRYPOINT ["openclaw", "gateway", "run"]
