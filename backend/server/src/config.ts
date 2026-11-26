export interface AppConfig {
  nodeEnv: "development" | "test" | "production";
  host: string;
  port: number;
  logLevel: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
  databaseUrl: string;
  redisUrl: string;
  maxBodyBytes: number;
}

function requiredUrl(name: string, value: string | undefined, allowed: string[]): string {
  if (!value) throw new Error(`CONFIG_MISSING_${name}`);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`CONFIG_INVALID_${name}`);
  }
  if (!allowed.includes(parsed.protocol)) throw new Error(`CONFIG_INVALID_${name}_PROTOCOL`);
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = env.NODE_ENV ?? "development";
  if (!["development", "test", "production"].includes(nodeEnv)) {
    throw new Error("CONFIG_INVALID_NODE_ENV");
  }

  const port = Number(env.PORT ?? "8080");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("CONFIG_INVALID_PORT");

  const maxBodyBytes = Number(env.MAX_BODY_BYTES ?? "1048576");
  if (!Number.isInteger(maxBodyBytes) || maxBodyBytes < 1024 || maxBodyBytes > 10_485_760) {
    throw new Error("CONFIG_INVALID_MAX_BODY_BYTES");
  }

  const logLevel = env.LOG_LEVEL ?? "info";
  if (!["fatal", "error", "warn", "info", "debug", "trace", "silent"].includes(logLevel)) {
    throw new Error("CONFIG_INVALID_LOG_LEVEL");
  }

  return {
    nodeEnv: nodeEnv as AppConfig["nodeEnv"],
    host: env.HOST ?? "127.0.0.1",
    port,
    logLevel: logLevel as AppConfig["logLevel"],
    databaseUrl: requiredUrl("DATABASE_URL", env.DATABASE_URL, ["postgres:", "postgresql:"]),
    redisUrl: requiredUrl("REDIS_URL", env.REDIS_URL, ["redis:", "rediss:"]),
    maxBodyBytes
  };
}
