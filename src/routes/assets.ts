import type { FastifyInstance } from "fastify";
import { AssetManifestStore } from "../config/assets.js";

/**
 * 远程包版本清单：客户端启动时拉一次，按返回的 hash 请求 `config.<hash>.json`。
 * 不需要鉴权；短缓存，清单文件损坏时降级为空清单，客户端自动回落到构建期版本。
 */
export async function registerAssetRoutes(app: FastifyInstance, store: AssetManifestStore): Promise<void> {
  app.get("/assets/manifest", { schema: { tags: ["assets"] } }, async (_request, reply) => {
    try {
      const manifest = store.read();
      void reply.header("cache-control", "public, max-age=60");
      return manifest;
    } catch (error) {
      app.log.warn({ err: error }, "asset manifest is invalid; serving an empty manifest");
      void reply.header("cache-control", "no-store");
      return {
        revision: 0,
        updatedAt: new Date(0).toISOString(),
        bundles: {},
      };
    }
  });
}