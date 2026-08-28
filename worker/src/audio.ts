import { spawn } from 'node:child_process';
import { createLogger } from '@project-subtitler/shared';

const log = createLogger('worker');

export const startAudioPipeline = (STREAM_URL: string): Promise<ReadableStream<Uint8Array>> => {
    return new Promise((resolve, reject) => {
        const ytDlp = spawn('yt-dlp', [
            '--no-warnings',
            '-f', 'bestaudio',
            '-o', '-',
            STREAM_URL,
        ]);

        // 16kHz mono s16le PCM
        const ffmpeg = spawn('ffmpeg', [
            '-hide_banner',
            '-loglevel', 'error',
            '-i', 'pipe:0',
            '-f', 's16le',
            '-ar', '16000',
            '-ac', '1',
            'pipe:1',
        ]);

        let settled = false;
        const fail = (err: Error) => {
            if (settled) return;
            settled = true;
            ytDlp.kill('SIGKILL');
            ffmpeg.kill('SIGKILL');
            reject(err);
        };

        ytDlp.on('error', (err) => fail(err));
        ffmpeg.on('error', (err) => fail(err));

        ytDlp.stdout.pipe(ffmpeg.stdin);
        ytDlp.stderr.on('data', (chunk: Buffer) => {
            log.debug(`yt-dlp: ${chunk.toString().trim()}`);
        });
        ffmpeg.stderr.on('data', (chunk: Buffer) => {
            log.error(`ffmpeg: ${chunk.toString().trim()}`);
        });

        const pcm: ReadableStream<Uint8Array> = new ReadableStream({
            start(controller) {
                let closed = false;
                const safeError = (err: Error) => {
                    if (closed) return;
                    closed = true;
                    controller.error(err);
                };

                ffmpeg.stdout.on('data', (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
                ffmpeg.stdout.on('end', () => {
                    if (closed) return;
                    closed = true;
                    controller.close();
                });
                ffmpeg.stdout.on('error', (err) => safeError(err));
                ffmpeg.on('close', (code) => {
                    if (code !== 0) {
                        log.critical(`ffmpeg exited with code ${code}`);
                        safeError(new Error(`ffmpeg exited with code ${code}`));
                    }
                });
                ytDlp.on('close', (code) => {
                    if (code !== 0 && !closed) {
                        log.critical(`yt-dlp exited with code ${code}`);
                        safeError(new Error(`yt-dlp exited with code ${code}`));
                    }
                });
            },
            cancel() {
                ytDlp.kill('SIGKILL');
                ffmpeg.kill('SIGKILL');
            },
        });

        resolve(pcm);
    });
};
