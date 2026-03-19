# Node.js + g++ 환경
FROM node:20-slim

# g++ 컴파일러 설치
RUN apt-get update && \
    apt-get install -y --no-install-recommends g++ && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 의존성 설치
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# 소스 복사 및 빌드
COPY tsconfig.json ./
COPY src/ ./src/
COPY sandbox/ ./sandbox/
RUN npm run build

# 환경 변수 기본값
ENV PORT=3001
ENV GPP_PATH=/usr/bin/g++

EXPOSE 3001

CMD ["node", "dist/index.js"]
