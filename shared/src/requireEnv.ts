import { createLogger } from "./logger.ts";

export const requireEnv = (log: ReturnType<typeof createLogger>, name: string): string => {
    const value = process.env[name];
    if (!value) {
        log.critical(`Missing ${name}`);
        process.exit(1);
    }
    return value;
};
