/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_BROADCAST_URL?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
