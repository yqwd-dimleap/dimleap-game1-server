import { AppError } from "./errors.js";

export type LoginProvider = "wx" | "tt";

export async function exchangePlatformCode(
  provider: LoginProvider,
  code: string,
  credentials: { appId: string | undefined; appSecret: string | undefined },
): Promise<string> {
  if (!credentials.appId || !credentials.appSecret) {
    throw new AppError(503, "PLATFORM_NOT_CONFIGURED", `${provider} 登录尚未配置`);
  }
  const timeout = AbortSignal.timeout(8000);
  if (provider === "wx") {
    const url = new URL("https://api.weixin.qq.com/sns/jscode2session");
    url.searchParams.set("appid", credentials.appId);
    url.searchParams.set("secret", credentials.appSecret);
    url.searchParams.set("js_code", code);
    url.searchParams.set("grant_type", "authorization_code");
    const response = await fetch(url, { signal: timeout });
    if (!response.ok) throw new AppError(502, "PLATFORM_LOGIN_FAILED", "微信登录服务不可用");
    const data = (await response.json()) as { openid?: unknown; errcode?: unknown; errmsg?: unknown };
    if (typeof data.openid !== "string" || !data.openid) {
      throw new AppError(401, "PLATFORM_LOGIN_FAILED", `微信登录失败：${String(data.errmsg ?? data.errcode ?? "unknown")}`);
    }
    return data.openid;
  }

  const response = await fetch("https://developer.toutiao.com/api/apps/v2/jscode2session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ appid: credentials.appId, secret: credentials.appSecret, code }),
    signal: timeout,
  });
  if (!response.ok) throw new AppError(502, "PLATFORM_LOGIN_FAILED", "抖音登录服务不可用");
  const data = (await response.json()) as {
    err_no?: unknown;
    err_tips?: unknown;
    data?: { openid?: unknown };
  };
  if (typeof data.data?.openid !== "string" || !data.data.openid) {
    throw new AppError(401, "PLATFORM_LOGIN_FAILED", `抖音登录失败：${String(data.err_tips ?? data.err_no ?? "unknown")}`);
  }
  return data.data.openid;
}
