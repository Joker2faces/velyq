import { env } from "cloudflare:workers";

export async function resolveRateLimitStore(): Promise<KVNamespace | null> {
  return env.VELYQ_RATE_LIMIT ?? null;
}
