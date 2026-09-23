import { createLogger, getWhitelist, requireEnv } from "@project-subtitler/shared";
import type { WhitelistEntry } from "@project-subtitler/shared";
import Dockerode from 'dockerode';

const docker = new Dockerode({ socketPath: '/var/run/docker.sock' });
const log = createLogger('watcher');
const workerIdleSince = new Map<string, number>();

const WATCHER_POLL_INTERVAL = Number(process.env.WATCH_POLL_INTERVAL || 60000);
const WORKER_IMAGE = process.env.WORKER_IMAGE || "project-subtitler-worker";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const TRANSCRIPTION_CONTEXT_LENGTH = Number(process.env.TRANSCRIPTION_CONTEXT_LENGTH || 5);
const WORKER_IDLE_TIMEOUT_MS = Number(process.env.WORKER_IDLE_TIMEOUT_MS || 120000);
const DEEPGRAM_MAX_RECONNECT_ATTEMPTS = Number(process.env.DEEPGRAM_MAX_RECONNECT_ATTEMPTS || 5);
const WORKER_NETWORK = process.env.WORKER_NETWORK || 'project-subtitler_default';
const LISTENER_CHECK_INTERVAL = Number(process.env.LISTENER_CHECK_INTERVAL || 30000);
const IDLE_SHUTDOWN_TIMEOUT = Number(process.env.IDLE_SHUTDOWN_TIMEOUT || 60000);

const BROADCAST_SECRET = requireEnv(log, 'BROADCAST_SECRET');
const DEEPGRAM_API_KEY = requireEnv(log, 'DEEPGRAM_API_KEY');
const OPENAI_API_KEY = requireEnv(log, 'OPENAI_API_KEY');
const BROADCAST_URL = requireEnv(log, 'BROADCAST_URL');

const main = async (): Promise<void> => {
    const whitelist: WhitelistEntry[] = getWhitelist();
    if (whitelist.length === 0) {
        log.critical('Whitelist is empty');
        process.exit(1);
    }

    log.info(`Loaded ${whitelist.length} whitelist entries`);

    // poll streams pages and spawn/stop workers
    setInterval(async () => {
        try {
            await pollWhitelist(whitelist);
        } catch (err) {
            log.error(`Whitelist poll failed: `, err);
        }
    }, WATCHER_POLL_INTERVAL);

    // periodically check listener counts and shut down idle workers
    setInterval(async () => {
        try {
            await checkIdleWorkers(whitelist);
        } catch (err) {
            log.error(`Idle worker check failed: `, err);
        }
    }, LISTENER_CHECK_INTERVAL);
}

const pollWhitelist = async (whitelist: WhitelistEntry[]): Promise<void> => {
    await Promise.all(whitelist.map(async (entry) => {
        try {
            const videoId = await getLatestStreamIdByChannel(entry.channelId);
            const latestStream = `https://www.youtube.com/watch?v=${videoId}`;
            const live = videoId !== null;
            await reportStatus(entry.slug, live ? videoId : null);
            const listenerCount = await getListenerCount(entry.slug);
            if (live && listenerCount > 0) {
                // Check if container is already running
                const containers = await docker.listContainers({ filters: { name: [entry.slug] } });
                if (containers.length === 0) {
                    log.info(`${entry.name} is LIVE! Starting worker...`);
                    await docker.createContainer({
                        Image: WORKER_IMAGE,
                        name: entry.slug,
                        Cmd: ["node", "worker/src/index.ts"],
                        HostConfig: {
                            AutoRemove: true,
                            NetworkMode: WORKER_NETWORK,
                        },
                        Env: [
                            'STREAM_URL=' + latestStream,
                            'SLUG=' + entry.slug,
                            'KEYTERMS=' + entry.keyterms.join(","),
                            'SOURCE_LANGUAGE=' + entry.sourceLanguage,
                            'TARGET_LANGUAGE=' + entry.targetLanguage,
                            'DEEPGRAM_API_KEY=' + DEEPGRAM_API_KEY,
                            'OPENAI_API_KEY=' + OPENAI_API_KEY,
                            'OPENAI_MODEL=' + OPENAI_MODEL,
                            'TRANSCRIPTION_CONTEXT_LENGTH=' + TRANSCRIPTION_CONTEXT_LENGTH,
                            'ALERT_WEBHOOK_URL=' + (process.env.ALERT_WEBHOOK_URL || ''),
                            'WORKER_IDLE_TIMEOUT_MS=' + WORKER_IDLE_TIMEOUT_MS,
                            'DEEPGRAM_MAX_RECONNECT_ATTEMPTS=' + DEEPGRAM_MAX_RECONNECT_ATTEMPTS,
                            'BROADCAST_URL=' + BROADCAST_URL,
                            'BROADCAST_SECRET=' + BROADCAST_SECRET,
                            'NODE_ENV=' + process.env.NODE_ENV,
                            'YTDLP_PROXY=' + (process.env.YTDLP_PROXY || ''),
                        ]
                    });
                    await docker.getContainer(entry.slug).start();
                    log.info(`Container started for ${entry.name}`);
                }
            }
        } catch (err) {
            log.error(`Failed to poll channel ${entry.slug}, container may not have started: `, err);
        }
    }));
};

const reportStatus = async (slug: string, streamId?: string | null): Promise<void> => {
    await fetch(`${BROADCAST_URL}/status`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${BROADCAST_SECRET}`,
        },
        body: JSON.stringify({ channel: slug, streamId }),
    }).catch(err => log.error(`Failed to report status for ${slug}: ${err}`));
};

/*
 * Scrapes youtube page structure to try and get the latest stream ID
 * The RSS feed has random outages, so this is more reliable but is prone to breaking if youtube changes their page structure
 */
const getLatestStreamIdByChannel = async (channelId: string): Promise<string | null> => {
    try {
        const response = await fetch(`https://www.youtube.com/channel/${channelId}/streams`);
        if (!response.ok) return null;
        const html = await response.text();
        // liveBadgeText only appears in the header "watch live" button when the channel is live, so the watchEndpoint right after is the stream
        const match = html.match(/"liveBadgeText":"[^"]*"[\s\S]*?"watchEndpoint":\{"videoId":"([^"]+)"/);
        return match ? match[1] : null;
    } catch (err) {
        log.error(`Failed to scrape /streams page for ${channelId}: ${err}`);
        return null;
    }
};

const getListenerCount = async (slug: string): Promise<number> => {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        try {
            const response = await fetch(`${BROADCAST_URL}/listeners/${slug}`, { signal: controller.signal });
            if (!response.ok) return 0;
            const data = await response.json() as { count: number };
            return data.count || 0;
        } finally {
            clearTimeout(timeout);
        }
    } catch (err) {
        log.error(`Failed to get listener count for ${slug}: ${err}`);
        return -1;
    }
};

const checkIdleWorkers = async (whitelist: WhitelistEntry[]): Promise<void> => {
    for (const entry of whitelist) {
        const videoId = await getLatestStreamIdByChannel(entry.channelId);
        if (videoId === null) continue;

        const count = await getListenerCount(entry.slug);
        if (count < 0) continue;
        if (count === 0) {
            if (!workerIdleSince.has(entry.slug)) {
                workerIdleSince.set(entry.slug, Date.now());
            }
            const elapsed = Date.now() - workerIdleSince.get(entry.slug)!;
            if (elapsed >= IDLE_SHUTDOWN_TIMEOUT) {
                try {
                    const containers = await docker.listContainers({ filters: { name: [entry.slug] } });
                    if (containers.length > 0) {
                        log.info(`${entry.name} had no listeners for ${Math.round(elapsed / 1000)}s, shutting down worker`);
                        const container = docker.getContainer(entry.slug);
                        await container.stop();
                    }
                } catch (err) {
                    log.error(`Failed to stop worker for ${entry.slug}: ${err}`);
                }
                workerIdleSince.delete(entry.slug);
            }
        } else {
            workerIdleSince.delete(entry.slug);
        }
    }
};

void main().catch((err) => {
    log.critical('fatal error, exiting: ', err);
    process.exit(1);
});
