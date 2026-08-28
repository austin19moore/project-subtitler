FROM node:23-slim

WORKDIR /app

COPY package*.json ./
COPY shared/package.json shared/
COPY worker/package.json worker/
COPY broadcast/package.json broadcast/
COPY watcher/package.json watcher/

RUN npm ci

RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg curl ca-certificates python3 && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/download/2026.08.19/yt-dlp -o /usr/local/bin/yt-dlp \
    && echo "1fa6733c37ea6fb51c99ad8fe785e7b7e5f3246c9b980230329d4fb72ed8d4d6  /usr/local/bin/yt-dlp" | sha256sum -c - \
    && chmod a+rx /usr/local/bin/yt-dlp

COPY . .

ENV NODE_ENV=production
ENV HOME=/tmp

RUN useradd -r -s /usr/sbin/nologin worker

USER worker

CMD ["node", "worker/src/index.ts"]
