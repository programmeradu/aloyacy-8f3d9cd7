// Shared worker env holder for Cloudflare Worker bindings (R2, SEND_EMAIL, etc.)

let currentWorkerEnv: Record<string, unknown> | undefined;

export function setWorkerEnv(env: unknown) {
  if (env && typeof env === "object") {
    currentWorkerEnv = env as Record<string, unknown>;
    try {
      Object.assign(process.env, env);
    } catch {
      // In some strict environments process.env may be immutable
    }
  }
}

export function getWorkerEnv(): Record<string, unknown> | undefined {
  if (currentWorkerEnv) return currentWorkerEnv;
  const globalEnv = (globalThis as any).__env__;
  if (globalEnv && typeof globalEnv === "object") {
    return globalEnv;
  }
  return undefined;
}
