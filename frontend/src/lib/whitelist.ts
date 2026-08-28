import type { WhitelistEntry } from "@project-subtitler/shared";
import whitelist from "@project-subtitler/shared/whitelist.json";

export const streamers = whitelist as WhitelistEntry[];

export const getStreamerBySlug = (slug: string): WhitelistEntry | undefined =>
    streamers.find((s) => s.slug === slug);
