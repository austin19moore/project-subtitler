FROM node:23-slim

WORKDIR /app

COPY package*.json ./
COPY shared/package.json shared/
COPY worker/package.json worker/
COPY broadcast/package.json broadcast/
COPY watcher/package.json watcher/

RUN npm ci

COPY . .

ENV NODE_ENV=production

RUN useradd -r -s /usr/sbin/nologin broadcast

USER broadcast

CMD ["node", "broadcast/src/index.ts"]
