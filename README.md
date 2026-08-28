# Project-Subtitler

A live subtitler for YouTube live streams. Auto runs short lived workers to transcribe/translate the stream.

## Setup

### Environment

- Copy `.env.example` to `.env` and fill in the required environment variables.

- Copy `shared/whitelist.json.example` to `shared/whitelist.json` and fill in the required fields.

- Add icons to `frontend/public/icons`, the file names should match the slugs in `shared/whitelist.json`.

### Docker Setup

```bash
npm run build
docker compose up -d
```

## Structure

### shared

- Shared code between workspaces. Containers logger, whitelist, and shared TypeScript types.

### watcher

- Polls the streams pages of whitelisted channels and spawns/stops one worker container per live streamer via the Docker socket proxy.

- Uses [`dockerode`](https://github.com/apocas/dockerode) to interact with the Docker socket proxy.

### docker-socket-proxy

- Proxies the Docker socket for the watcher. Only exposes the container list, create, and start endpoints.

- Uses [`docker-socket-proxy`](https://github.com/tecnativa/docker-socket-proxy) to restrict Docker socket access.

### worker

- Transcribes the live stream and sends the transcript to the broadcast container.

- Uses [`yt-dlp`](https://github.com/yt-dlp/yt-dlp) to get stream audio.

- Uses [`ffmpeg`](https://ffmpeg.org/) to convert the stream to PCM.

- Uses [`@deepgram/sdk`](https://github.com/deepgram-devs/deepgram-sdk-js) to transcribe the stream.

- Uses [`openai`](https://github.com/openai/openai-node) to translate.

### broadcast

- Receives the transcripts from the workers and sends them to the frontend.

- Uses [`better-sse`](https://github.com/MatthewWid/better-sse) to send the transcripts to the frontend.

### frontend

- Displays the subtitles. Built with Vite and React.

- Uses Tailwind CSS for styling.

### caddy

- Serves the frontend and proxies the SSE and status routes to the broadcast container.

## Development

- Set `NODE_ENV` environment variable to `development` to enable development logging.

- Run `npm install` to install dependencies.

- Run `npm run typecheck` to check for type errors.

- Run `npm run lint` to check for lint errors.

- Run `npm run test` to run the test suite.

- Run `npm run build` to build the frontend and worker image.
