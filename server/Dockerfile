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
    apt-get install -y --no-install-recommends g++ gdb util-linux && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY sandbox/ ./sandbox/
COPY seccomp-profile.json ./seccomp-profile.json

ENV PORT=3001
ENV GPP_PATH=/usr/bin/g++
ENV GDB_PATH=/usr/bin/gdb
ENV USE_GDB=true
ENV PRLIMIT_PATH=/usr/bin/prlimit

# Drop root inside the container — user code never needs privileges, and
# CAP_SYS_PTRACE is not required for ptrace on the same uid.
RUN useradd --system --create-home --shell /usr/sbin/nologin sandbox
USER sandbox

EXPOSE 3001

# Recommended runtime invocation:
#   docker run \
#     --read-only --tmpfs /tmp:exec --tmpfs /dev/shm:exec \
#     --memory=512m --cpus=1 --pids-limit=128 \
#     --security-opt=no-new-privileges \
#     --security-opt seccomp=/app/seccomp-profile.json \
#     -p 3001:3001 server-image
#
# (When ptrace is denied by the platform, set USE_GDB=false to use
# the instrumenter fallback and restrict ptrace in seccomp too.)
CMD ["node", "dist/index.js"]
