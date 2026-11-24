import { Redis } from "ioredis";
import type { FastifyBaseLogger } from "fastify";

export class OptionalRedis {
  private readonly client: Redis | null;
  private connected = false;
  private warned = false;

  constructor(url: string | undefined, private readonly logger: FastifyBaseLogger) {
    this.client = url
      ? new Redis(url, {
          lazyConnect: true,
          connectTimeout: 1500,
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
          retryStrategy: () => null,
        })
      : null;
    this.client?.on("error", (error: Error) => {
      if (this.warned) return;
      this.warned = true;
      this.logger.warn({ err: error }, "Redis unavailable; continuing with MySQL");
    });
    this.client?.on("ready", () => {
      this.connected = true;
      this.logger.info("Redis connected");
    });
    this.client?.on("close", () => {
      this.connected = false;
    });
  }

  async connect(): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.connect();
    } catch {
      this.connected = false;
    }
  }

  async ping(): Promise<boolean> {
    if (!this.client) return false;
    try {
      return (await this.client.ping()) === "PONG";
    } catch {
      return false;
    }
  }

  async getJson<T>(key: string): Promise<T | null> {
    if (!this.client) return null;
    try {
      const value = await this.client.get(key);
      return value ? (JSON.parse(value) as T) : null;
    } catch {
      return null;
    }
  }

  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.set(key, JSON.stringify(value), "EX", ttlSeconds);
    } catch {
      // Cache failure must not fail the request.
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  async close(): Promise<void> {
    if (this.client && this.client.status !== "end") await this.client.quit().catch(() => undefined);
  }
}
