import { readFileSync, statSync } from "node:fs";
import path from "node:path";

/** 一个远程包的版本指针；version 就是 config.<version>.json 里的 hash。 */
export interface AssetBundleVersion {
  version: string;
  minClientVersion: string;
  /** 0-100，按用户分桶放量；P0 只下发，不参与服务端决策。 */
  rollout: number;
  /** 回滚目标；缺失表示无可回退版本。 */
  previous?: string;
}

export interface AssetManifest {
  revision: number;
  updatedAt: string;
  bundles: Readonly<Record<string, AssetBundleVersion>>;
}

const BUNDLE_NAME = /^[a-z][a-z0-9_]*$/;
// Cocos 的 bundle 版本是构建产出的短 hash（如 55bdc / fd081），只允许安全字符，避免拼出非法 URL。
const BUNDLE_VERSION = /^[0-9A-Za-z]{1,32}$/;
const CLIENT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

const EMPTY: AssetManifest = Object.freeze({
  revision: 0,
  updatedAt: new Date(0).toISOString(),
  bundles: Object.freeze({}),
});

/**
 * 远程包版本清单存储。
 *
 * 运维改 `config/assets.json` 即可生效（按 mtime 热加载），不需要重建镜像或重启进程。
 * 文件缺失视为“没有服务端覆盖”，返回空清单；内容非法则抛错，由路由降级为空清单并告警。
 */
export class AssetManifestStore {
  private cached: { mtimeMs: number; manifest: AssetManifest } | undefined;

  constructor(
    private readonly file = process.env.ASSET_MANIFEST_FILE ?? path.resolve(process.cwd(), "config", "assets.json"),
  ) {}

  read(): AssetManifest {
    let mtimeMs: number;
    try {
      mtimeMs = statSync(this.file).mtimeMs;
    } catch {
      this.cached = undefined;
      return EMPTY;
    }
    if (this.cached && this.cached.mtimeMs === mtimeMs) return this.cached.manifest;
    const manifest = this.parse(JSON.parse(readFileSync(this.file, "utf8")) as unknown);
    this.cached = { mtimeMs, manifest };
    return manifest;
  }

  private parse(raw: unknown): AssetManifest {
    if (!raw || Array.isArray(raw) || typeof raw !== "object") {
      throw new Error("assets.json: expected an object");
    }
    const source = raw as Record<string, unknown>;
    const revision = source.revision ?? 0;
    if (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 0) {
      throw new Error("assets.json.revision: expected integer >= 0");
    }
    const updatedAt = source.updatedAt;
    if (typeof updatedAt !== "string" || Number.isNaN(Date.parse(updatedAt))) {
      throw new Error("assets.json.updatedAt: expected an ISO timestamp");
    }
    const rawBundles = source.bundles ?? {};
    if (!rawBundles || Array.isArray(rawBundles) || typeof rawBundles !== "object") {
      throw new Error("assets.json.bundles: expected an object");
    }
    const bundles: Record<string, AssetBundleVersion> = {};
    for (const [name, value] of Object.entries(rawBundles as Record<string, unknown>)) {
      if (!BUNDLE_NAME.test(name)) {
        throw new Error(`assets.json.bundles/${name}: bundle name must match ${BUNDLE_NAME}`);
      }
      if (!value || Array.isArray(value) || typeof value !== "object") {
        throw new Error(`assets.json.bundles/${name}: expected an object`);
      }
      const row = value as Record<string, unknown>;
      const previous = row.previous === undefined || row.previous === null
        ? undefined
        : bundleVersion(row.previous, `assets.json.bundles/${name}.previous`);
      bundles[name] = {
        version: bundleVersion(row.version, `assets.json.bundles/${name}.version`),
        minClientVersion: clientVersion(row.minClientVersion, `assets.json.bundles/${name}.minClientVersion`),
        rollout: rollout(row.rollout, `assets.json.bundles/${name}.rollout`),
        ...(previous === undefined ? {} : { previous }),
      };
    }
    return { revision, updatedAt, bundles };
  }
}

function bundleVersion(value: unknown, label: string): string {
  if (typeof value !== "string" || !BUNDLE_VERSION.test(value)) {
    throw new Error(`${label}: expected a bundle hash (${BUNDLE_VERSION})`);
  }
  return value;
}

function clientVersion(value: unknown, label: string): string {
  if (typeof value !== "string" || !CLIENT_VERSION.test(value)) {
    throw new Error(`${label}: expected a semantic version`);
  }
  return value;
}

function rollout(value: unknown, label: string): number {
  if (value === undefined || value === null) return 100;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 100) {
    throw new Error(`${label}: expected integer 0-100`);
  }
  return value;
}