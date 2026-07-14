# Seahorse — Coding Agent Harness
# Multi-stage Docker build

# ── Builder ──
FROM node:22-alpine AS builder

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY tsconfig.json tsconfig.eslint.json ./
COPY src/ ./src/
RUN npm run build

# ── Runtime ──
FROM node:22-alpine

RUN addgroup -S seahorse && adduser -S seahorse -G seahorse

WORKDIR /workspace

COPY --from=builder /app/dist/ /app/dist/
COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/node_modules/ /app/node_modules/

# Create symlink for CLI
RUN ln -s /app/dist/cli/main.js /usr/local/bin/seahorse && chmod +x /usr/local/bin/seahorse

USER seahorse

VOLUME ["/workspace", "/home/seahorse/.seahorse"]

ENTRYPOINT ["seahorse"]
CMD ["--help"]