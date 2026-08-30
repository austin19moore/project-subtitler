import { createLogger, getWhitelist, requireEnv } from "@project-subtitler/shared";
import type { WhitelistEntry } from "@project-subtitler/shared";
import Dockerode from 'dockerode';

const docker = new Dockerode({ socketPath: '/var/run/docker.sock' });
const log = createLogger('watcher');
const WATCHER_POLL_INTERVAL = Number(process.env.WATCH_POLL_INTERVAL || 60000);

const WORKER_IMAGE = process.env.WORKER_IMAGE || "project-subtitler-worker";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const TRANSCRIPTION_CONTEXT_LENGTH = Number(process.env.TRANSCRIPTION_CONTEXT_LENGTH || 5);
const ALERT_WEBHOOK_URL = process.env.ALERT_WEBHOOK_URL;
const WORKER_IDLE_TIMEOUT_MS = Number(process.env.WORKER_IDLE_TIMEOUT_MS || 120000);
const DEEPGRAM_MAX_RECONNECT_ATTEMPTS = Number(process.env.DEEPGRAM_MAX_RECONNECT_ATTEMPTS || 5);
const WORKER_NETWORK = process.env.WORKER_NETWORK || 'project-subtitler_default';

const BROADCAST_SECRET=requireEnv(log, 'BROADCAST_SECRET');
const DEEPGRAM_API_KEY=requireEnv(log, 'DEEPGRAM_API_KEY');
const OPENAI_API_KEY=requireEnv(log, 'OPENAI_API_KEY');
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
}

const pollWhitelist = async (whitelist: WhitelistEntry[]): Promise<void> => {
    await Promise.all(whitelist.map(async (entry) => {
        try {
            const videoId = await getLatestStreamIdByChannel(entry.channelId);
            const latestStream = `https://www.youtube.com/watch?v=${videoId}`;
            const live = videoId !== null;
            await reportStatus(entry.slug, live ? videoId : null);
            if (live) {
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
                            'ALERT_WEBHOOK_URL=' + (ALERT_WEBHOOK_URL || ''),
                            'WORKER_IDLE_TIMEOUT_MS=' + WORKER_IDLE_TIMEOUT_MS,
                            'DEEPGRAM_MAX_RECONNECT_ATTEMPTS=' + DEEPGRAM_MAX_RECONNECT_ATTEMPTS,
                            'BROADCAST_URL=' + BROADCAST_URL,
                            'BROADCAST_SECRET=' + BROADCAST_SECRET,
                            'NODE_ENV=' + process.env.NODE_ENV,
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

void main().catch((err) => {
    log.critical('fatal error, exiting: ', err);
    process.exit(1);
});
