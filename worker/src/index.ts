import { createLogger, requireEnv } from '@project-subtitler/shared';
import { startAudioPipeline } from './audio.ts';
import { Deepgram } from './deepgram.ts';
import { OpenAIClient } from './openai.ts';

const log = createLogger('worker');

const SOURCE_LANGUAGE = process.env.SOURCE_LANGUAGE || 'ja';
const TARGET_LANGUAGE = process.env.TARGET_LANGUAGE || 'en';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const TRANSCRIPTION_CONTEXT_LENGTH = Number(process.env.TRANSCRIPTION_CONTEXT_LENGTH || 5);
const TRANSCRIPTION_CONFIDENCE_THRESHOLD = Number(process.env.TRANSCRIPTION_CONFIDENCE_THRESHOLD || 0.65);
const MAX_START_ATTEMPTS = Number(process.env.MAX_START_ATTEMPTS || 3);
const MAX_PUSH_ATTEMPTS = Number(process.env.MAX_PUSH_ATTEMPTS || 3);
let KEYTERMS: string | string[] | undefined = process.env.KEYTERMS;

const STREAM_URL = requireEnv(log, 'STREAM_URL');
const SLUG = requireEnv(log, 'SLUG');
const BROADCAST_URL = requireEnv(log, 'BROADCAST_URL');
const BROADCAST_SECRET=requireEnv(log, 'BROADCAST_SECRET');
const DEEPGRAM_API_KEY=requireEnv(log, 'DEEPGRAM_API_KEY');
const OPENAI_API_KEY=requireEnv(log, 'OPENAI_API_KEY');

if (KEYTERMS) {
    KEYTERMS = KEYTERMS ? KEYTERMS.split(',') : [];
} else {
    log.error('Warning: Missing KEYTERMS, add to improve STT accuracy');
}

if (!process.env.SOURCE_LANGUAGE) {
    log.error(`Warning: Missing SOURCE_LANGUAGE, defaulting to ${SOURCE_LANGUAGE}`);
}

const main = async (): Promise<void> => {
    log.info(`Starting worker for ${SLUG}`);

    let pcm: ReadableStream<Uint8Array> | undefined;
    for (let attempt = 1; attempt <= MAX_START_ATTEMPTS; attempt++) {
        try {
            pcm = await startAudioPipeline(STREAM_URL);
            log.info(`Audio pipeline started`);
            break;
        } catch (err) {
            log.error(`Audio pipeline start failed (attempt ${attempt}/${MAX_START_ATTEMPTS}): `, err);
            if (attempt === MAX_START_ATTEMPTS) throw err;
            await new Promise(_ => setTimeout(_, 5000 * attempt));
        }
    }
    if (!pcm) throw new Error('Audio pipeline failed to start');

    const openai = new OpenAIClient(OPENAI_API_KEY, SOURCE_LANGUAGE, TARGET_LANGUAGE, OPENAI_MODEL, TRANSCRIPTION_CONTEXT_LENGTH, KEYTERMS as string[], TRANSCRIPTION_CONFIDENCE_THRESHOLD);

    // deepgram transcribe (read from pcm, feed chunks to Deepgram WebSocket)
    const deepgram = new Deepgram(DEEPGRAM_API_KEY, SOURCE_LANGUAGE, KEYTERMS as string[]);
    deepgram.startIdleWatchdog();
    deepgram.connect(pcm, (text, isFinal, words) => {
        if (!isFinal) return;
        log.debug('transcribed:', text);
        if (shouldSkipTranscript(text)) {
            log.debug('skipping junk transcript:', text);
            return;
        }
        openai.translate(text, words).then(translation => {
            log.debug('translated:', translation);
            // send to broadcast
            return pushToBroadcast({
                channel: SLUG,
                transcript: text,
                translation,
                timestamp: Date.now(),
            });
        }).catch(err => {
            log.error('Translation failed: ', err);
        });
    }).catch(err => {
        log.critical(`Deepgram connect failed: `, err);
        process.exit(1);
    });

    process.on('SIGTERM', () => {
        deepgram.close();
        deepgram.cancelPcm();
        process.exit(0);
    });
}

const pushToBroadcast = async (payload: Record<string, unknown>, attempt = 1): Promise<void> => {
    try {
        const response = await fetch(`${BROADCAST_URL}/broadcast`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${BROADCAST_SECRET}`,
            },
            body: JSON.stringify(payload),
        });
        if (!response.ok) {
            throw new Error(`broadcast responded with ${response.status}`);
        }
    } catch (err) {
        if (attempt < MAX_PUSH_ATTEMPTS) {
            log.error(`broadcast push failed (attempt ${attempt}/${MAX_PUSH_ATTEMPTS}), retrying: `, err);
            await new Promise(_ => setTimeout(_, 5000 * attempt));
            return pushToBroadcast(payload, attempt + 1);
        }
        log.error('broadcast push failed after retries: ', err);
    }
};

export const shouldSkipTranscript = (text: string): boolean => {
    const trimmed = text.trim();
    if (!trimmed) return true;

    // Just punctuation
    if (/^[\p{P}\p{S}\s]+$/u.test(trimmed)) return true;

    // Too short to be important
    return trimmed.split(/\s+/).every(t => t.length < 2);
};

void main().catch((err) => {
    log.critical('fatal error, exiting: ', err);
    process.exit(1);
});
