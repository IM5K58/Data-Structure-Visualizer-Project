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

# This image runs arbitrary user C++. It MUST be started with resource and
# syscall restrictions — `docker run image` with no flags is an unbounded remote
# code execution endpoint. Prefer `docker compose up compiler`, which applies
# them all; the equivalent raw invocation is:
#
#   docker run \
#     --read-only \
#     --tmpfs /tmp:exec,mode=1777,size=256m \
#     --tmpfs /dev/shm:exec,mode=1777,size=256m \
#     --memory=512m --cpus=1 --pids-limit=128 \
#     --security-opt=no-new-privileges \
#     --security-opt seccomp=./seccomp-profile.json \
#     -p 3001:3001 server-image
#
# The seccomp path is read off the HOST by the Docker CLI before the container
# exists, so it must be a host path — the copy at /app inside the image is never
# read. Dropping the flag silently falls back to Docker's default profile.
#
# The exec flag on both tmpfs mounts is load-bearing, not tidiness: compiled user
# binaries are written there and then run, and Docker mounts /dev/shm noexec by
# default. Without it the binary is written successfully and cannot be executed,
# which does not look like a mount problem from the outside. The server probes
# for this at startup and falls back to the OS temp dir; TEMP_BASE overrides it.
#
# On Linux the process refuses to start if prlimit is missing, so per-process
# CPU/memory/file-size caps cannot be dropped by accident. They CAN still be
# dropped on purpose: DISABLE_RLIMIT=true starts the server with none of them.
#
# (When ptrace is denied by the platform, set USE_GDB=false: the program
# still runs and returns its output, just without a step trace — so there is
# nothing to visualize. There is no instrumenter fallback any more.)
CMD ["node", "dist/index.js"]
