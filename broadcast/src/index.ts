import { createLogger, requireEnv } from '@project-subtitler/shared';
import express from 'express';
import { createSession, Channel } from 'better-sse'
import crypto from 'node:crypto'
import rateLimit from 'express-rate-limit'

const app = express();
app.set('trust proxy', 1);
const logger = createLogger('broadcast');
const BROADCAST_PORT = 3000;
const BROADCAST_SECRET = requireEnv(logger, 'BROADCAST_SECRET');

if (!BROADCAST_SECRET) {
    logger.error('BROADCAST_SECRET is not set');
    process.exit(1);
}

app.use(express.json({ limit: '10kb' }));

const channels = new Map<string, Channel>();
const streamIds = new Map<string, { streamId: string; updatedAt: number }>();
const BROADCAST_STREAM_ID_TTL = Number(process.env.STREAM_ID_TTL_MS || 300000);

setInterval(() => {
    const now = Date.now();
    for (const [channel, entry] of streamIds) {
        if (now - entry.updatedAt > BROADCAST_STREAM_ID_TTL) {
            streamIds.delete(channel);
        }
    }
}, 60000);

const sseLimiter = rateLimit({ windowMs: 60000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false });
const statusGetLimiter = rateLimit({ windowMs: 60000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false });

// timingSafeEqual prevents timing attacks
const isAuthorized = (req: express.Request): boolean => {
    const expected = Buffer.from(`Bearer ${BROADCAST_SECRET}`);
    const provided = Buffer.from(req.headers.authorization ?? '');
    return expected.length === provided.length && crypto.timingSafeEqual(expected, provided);
};

const getChannel = (name: string): Channel => {
    const existing = channels.get(name);
    if (existing) {
        return existing;
    }
    const channel: Channel = new Channel();
    channel.on('session-deregistered', () => {
        if (channel.sessionCount === 0) {
            channels.delete(name);
        }
    });
    channels.set(name, channel);
    return channel;
};

const isValidChannel = (channel: unknown): channel is string =>
    typeof channel === 'string' && /^[a-z0-9_-]{1,64}$/i.test(channel);

app.get('/sse', sseLimiter, async (req: express.Request, res: express.Response) => {
    const channel = req.query.channel;
    if (!isValidChannel(channel)) {
        return res.status(400).send('missing or invalid channel');
    }
    try {
        const session = await createSession(req, res);
        getChannel(channel).register(session);
    } catch (err) {
        logger.error('SSE session creation failed: ', err);
        if (!res.headersSent) {
            res.status(500).send('internal error');
        }
    }
});

app.post('/broadcast', (req: express.Request, res: express.Response) => {
    if (!isAuthorized(req)) {
        return res.status(401).send('unauthorized');
    }
    const { channel, transcript, translation, timestamp } = req.body ?? {};
    if (!isValidChannel(channel) || typeof transcript !== 'string' || typeof translation !== 'string') {
        return res.status(400).send('invalid request');
    }
    const ch = channels.get(channel);
    if (ch && ch.sessionCount > 0) {
        ch.broadcast({ channel, transcript, translation, timestamp: typeof timestamp === 'number' ? timestamp : Date.now() }, 'translation');
    }
    res.status(200).end();
});

app.get('/status', statusGetLimiter, (req: express.Request, res: express.Response) => {
    const channel = req.query.channel;
    if (!isValidChannel(channel)) {
        return res.status(400).send('missing or invalid channel');
    }
    return res.json({ streamId: streamIds.get(channel)?.streamId ?? null });
});

app.post('/status', (req: express.Request, res: express.Response) => {
    if (!isAuthorized(req)) {
        return res.status(401).send('unauthorized');
    }
    const { channel, streamId } = req.body ?? {};
    if (!isValidChannel(channel)) {
        return res.status(400).send('invalid request');
    }
    if (typeof streamId === 'string') {
        streamIds.set(channel, { streamId, updatedAt: Date.now() });
    } else {
        streamIds.delete(channel);
    }
    res.status(200).end();
});

app.listen(BROADCAST_PORT);

logger.info(`Listening on port ${BROADCAST_PORT}`);
