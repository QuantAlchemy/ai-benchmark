import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { parseEnv } from "node:util";

const DATA_ROOT_ENV = "AI_BENCHMARK_DATA_ROOT";
const SYNC_URL_ENV = "AI_BENCHMARK_SYNC_URL";
const SYNC_CLIENT_ID_ENV = "AI_BENCHMARK_SYNC_CLIENT_ID";
const SYNC_CLIENT_TOKEN_ENV = "AI_BENCHMARK_SYNC_CLIENT_TOKEN";

type SyncEnvironment = Partial<Record<string, string | undefined>>;

type SyncCredentials = Readonly<{
  url: string;
  clientId: string;
  clientToken: string;
}>;

export type ServerSyncConfig = Readonly<{
  dataRoot: string;
  credentials: SyncCredentials | null;
}>;

export type PublicSyncConfig = Readonly<{
  syncEnabled: boolean;
}>;

export function readServerSyncConfig({
  env = process.env,
  homeDir = homedir(),
  projectRoot = process.cwd(),
}: {
  env?: SyncEnvironment;
  homeDir?: string;
  projectRoot?: string;
} = {}): ServerSyncConfig {
  const fileEnvironment: SyncEnvironment = {};
  for (const name of [".env", ".env.local"]) {
    const path = resolve(projectRoot, name);
    if (existsSync(path)) Object.assign(fileEnvironment, parseEnv(readFileSync(path, "utf8")));
  }
  const effectiveEnvironment = { ...fileEnvironment, ...env };
  const configuredDataRoot = effectiveEnvironment[DATA_ROOT_ENV]?.trim();
  const xdgDataHome = effectiveEnvironment.XDG_DATA_HOME?.trim() || join(homeDir, ".local", "share");
  const dataRoot = configuredDataRoot
    ? resolve(projectRoot, configuredDataRoot)
    : resolve(xdgDataHome, "ai-benchmark");
  const url = effectiveEnvironment[SYNC_URL_ENV]?.trim();
  const clientId = effectiveEnvironment[SYNC_CLIENT_ID_ENV]?.trim();
  const clientToken = effectiveEnvironment[SYNC_CLIENT_TOKEN_ENV]?.trim();
  const credentials = url && clientId && clientToken ? { url, clientId, clientToken } : null;

  return { dataRoot, credentials };
}

export function toPublicSyncConfig(config: ServerSyncConfig): PublicSyncConfig {
  return { syncEnabled: config.credentials !== null };
}
