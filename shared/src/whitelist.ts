import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

export interface WhitelistEntry {
    channelId: string;
    name: string;
    slug: string;
    keyterms: string[];
    sourceLanguage: string;
    targetLanguage: string;
}

export function getWhitelist(): WhitelistEntry[] {
    return require("../whitelist.json") as WhitelistEntry[];
}
