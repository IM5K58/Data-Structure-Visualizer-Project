# Stage 1: 빌드 (tsc 포함)
FROM node:20-slim AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Stage 2: 실행 (프로덕션 의존성만)
FROM node:20-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends g++ gdb && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY sandbox/ ./sandbox/

ENV PORT=3001
ENV GPP_PATH=/usr/bin/g++
ENV GDB_PATH=/usr/bin/gdb
ENV USE_GDB=true

EXPOSE 3001

CMD ["node", "dist/index.js"]
