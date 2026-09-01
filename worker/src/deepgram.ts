import { DeepgramClient } from '@deepgram/sdk'
import type { V1Socket } from '@deepgram/sdk/listen/v1';
import { createLogger } from '@project-subtitler/shared';

const log = createLogger('worker');
type TranscriptWord = { word?: string; confidence?: number };
type TranscriptCallback = (text: string, isFinal: boolean, words?: TranscriptWord[]) => void;

export class Deepgram {
    private client: DeepgramClient;
    private socket = null as V1Socket | null;
    private sourceLanguage: string;
    private keyterms: string[];
    private closed = false;
    private reconnecting = false;
    private reconnectAttempts = 0;
    private readonly maxReconnectAttempts = Number(process.env.DEEPGRAM_MAX_RECONNECT_ATTEMPTS || 5);
    private readonly idleTimeoutMs = Number(process.env.WORKER_IDLE_TIMEOUT_MS || 120000);
    private readonly vadThreshold = process.env.DEEPGRAM_VAD_THRESHOLD || '0.6';
    private readonly vadPreendBufferMs = process.env.DEEPGRAM_VAD_PREEND_BUFFER_MS || '300';
    private lastAudioAt = Date.now();
    private idleTimer: NodeJS.Timeout | null = null;
    private pcmReader: ReadableStreamDefaultReader<Uint8Array> | null = null;

    constructor(apiKey: string, sourceLanguage: string, keyterms: string[]) {
        this.client = new DeepgramClient({ apiKey });
        this.sourceLanguage = sourceLanguage;
        this.keyterms = keyterms;
    }

    private async connectSocket(onTranscript: TranscriptCallback) {
        this.socket = await this.client.listen.v1.createConnection({
            model: 'nova-3',
            language: this.sourceLanguage,
            vad_events: 'true',
            keyterm: this.keyterms,
            encoding: 'linear16',
            sample_rate: 16000,
            channels: 1,
            queryParams: {
                vad_threshold: this.vadThreshold,
                vad_preend_buffer_ms: this.vadPreendBufferMs,
            },
        });

        this.socket.on('open', () => {
            log.info('Deepgram connection opened');
            this.reconnectAttempts = 0;
            this.reconnecting = false;
        });

        this.socket.on('message', (data) => {
            if (data.type === 'Results' && data.channel.alternatives?.[0]) {
                const alternative = data.channel.alternatives[0];
                const transcript = alternative.transcript;
                if (transcript) {
                    onTranscript(transcript, data.is_final ?? false, alternative.words);
                }
            }
            if (data.type === 'SpeechStarted') {
                this.lastAudioAt = Date.now();
            }
        });

        this.socket.on('error', (err) => {
            log.error(`Deepgram error: ${err}`);
        });

        this.socket.on('close', () => {
            this.socket = null;
            if (this.closed || this.reconnecting) return;
            this.reconnecting = true;
            log.info('Deepgram connection closed, reconnecting...');
            setTimeout(() => {
                if (this.closed || this.reconnecting) return;
                this.connectSocket(onTranscript)
                    .catch((err) => {
                        this.reconnectAttempts++;
                        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                            this.reconnecting = false;
                            log.critical(`Deepgram reconnect failed after ${this.reconnectAttempts} attempts, shutting down worker: `, err);
                            process.exit(1);
                        }
                        log.error(`Deepgram reconnect failed (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}): `, err);
                    });
            }, 1000);
        });

        this.socket.connect();
        await this.socket.waitForOpen();
    }

    async connect(pcm: ReadableStream<Uint8Array>, onTranscript: TranscriptCallback) {
        if (this.closed) return;

        await this.connectSocket(onTranscript);

        const reader = pcm.getReader();
        this.pcmReader = reader;
        while (!this.closed) {
            const { done, value } = await reader.read();
            if (done) break;

            // wait for socket to reconnect, audio is dropped in the meantime
            while (!this.socket && !this.closed) {
                await new Promise(r => setTimeout(r, 500));
            }
            if (!this.socket) break;

            this.socket.sendMedia(value);
        }
        this.pcmReader = null;
        reader.releaseLock();

        this.close();
        log.info('Audio stream ended, shutting down worker');
        process.exit(0);
    }

    cancelPcm() {
        this.pcmReader?.cancel().catch(() => {});
    }

    startIdleWatchdog() {
        this.idleTimer = setInterval(() => {
            const idleMs = Date.now() - this.lastAudioAt;
            if (idleMs > this.idleTimeoutMs) {
                log.info(`No audio received for ${Math.round(idleMs / 1000)}s, shutting down worker`);
                this.close();
                process.exit(0);
            }
        }, 10000);
    }

    close() {
        this.closed = true;
        if (this.idleTimer) clearInterval(this.idleTimer);
        this.socket?.close();
    }
}
