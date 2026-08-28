const ALERT_WEBHOOK_URL = process.env.ALERT_WEBHOOK_URL;

export function createLogger(tag: string) {
    const dev = process.env.NODE_ENV === 'development';
    return {
        debug: (...args: unknown[]) => { if (dev) console.log(`[${tag}]`, ...args); },
        info: (...args: unknown[]) => console.log(`[${tag}]`, ...args),
        error: (...args: unknown[]) => console.error(`[${tag}]`, ...args),
        critical: (...args: unknown[]) => {
            console.error(`CRITICAL [${tag}]`, ...args);
            if (ALERT_WEBHOOK_URL) {
                // send alert to webhook
            }
        },
    };
}
