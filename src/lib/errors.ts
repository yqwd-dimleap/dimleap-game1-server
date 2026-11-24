export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function badRequest(code: string, message: string): never {
  throw new AppError(400, code, message);
}

export function unauthorized(message = "登录状态无效，请重新登录"): never {
  throw new AppError(401, "UNAUTHORIZED", message);
}

export function forbidden(message = "无权执行该操作"): never {
  throw new AppError(403, "FORBIDDEN", message);
}

export function notFound(message = "数据不存在"): never {
  throw new AppError(404, "NOT_FOUND", message);
}

export function conflict(code: string, message: string): never {
  throw new AppError(409, code, message);
}
