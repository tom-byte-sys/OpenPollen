FROM node:20-slim

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build
COPY tsconfig.json ./
COPY src/ ./src/
COPY cli/ ./cli/
COPY plugins/ ./plugins/
COPY skills/ ./skills/
COPY openpollen.json.example ./

RUN npm run build

# Create data directory
RUN mkdir -p /data/skills /data/logs /data/memory

# Default config and data paths
ENV OPENPOLLEN_CONFIG=/app/openpollen.json
ENV GATEWAY_HOST=0.0.0.0
ENV GATEWAY_PORT=18800

EXPOSE 18800 3001

CMD ["node", "dist/src/index.js"]
