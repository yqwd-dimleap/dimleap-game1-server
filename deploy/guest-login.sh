#!/usr/bin/env bash
# 测试期开关：控制正式环境的浏览器游客登录（dev provider）
# 在服务器上执行（/opt/runestone-server 下）：
#   ./deploy/guest-login.sh status   查看当前状态并实测一次 dev 登录
#   ./deploy/guest-login.sh on       临时开启，约 15 秒中断
#   ./deploy/guest-login.sh off      测试结束立即关闭
#
# 只改 ALLOW_GUEST_LOGIN，不动 .env 其他内容；每次改动前自动备份 .env。

set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE=".env"
ACTION="${1:-status}"
API_BASE="${API_BASE:-https://api.0ygame.cn}"

current() { grep -E '^ALLOW_GUEST_LOGIN=' "$ENV_FILE" 2>/dev/null | cut -d= -f2 || true; }

probe() {
  curl -s -o /dev/null -m 10 -w '%{http_code}' -X POST "$API_BASE/api/v1/auth/login" \
    -H 'content-type: application/json' -d '{"provider":"dev","devId":"guest-login-probe-001"}'
}

case "$ACTION" in
  status)
    value="$(current)"
    echo "ALLOW_GUEST_LOGIN=${value:-未设置（等效 false）}"
    code="$(probe || echo 000)"
    echo "dev 登录实测：http=$code"
    if [ "$code" = "200" ]; then
      echo "结论：游客登录已开启"
    else
      echo "结论：游客登录未开启或服务异常"
    fi
    ./scripts/compose-prod.sh ps --format "table {{.Name}}\t{{.Status}}" 2>/dev/null | tail -4 || true
    ;;

  on | off)
    want=false
    [ "$ACTION" = "on" ] && want=true
    if [ "$(current)" = "$want" ]; then
      echo "ALLOW_GUEST_LOGIN 已经是 $want，无需改动"
      exit 0
    fi
    backup=".env.bak.$(date +%Y%m%d-%H%M%S)"
    cp -a "$ENV_FILE" "$backup"
    if grep -qE '^ALLOW_GUEST_LOGIN=' "$ENV_FILE"; then
      sed -i "s/^ALLOW_GUEST_LOGIN=.*/ALLOW_GUEST_LOGIN=$want/" "$ENV_FILE"
    else
      printf '\nALLOW_GUEST_LOGIN=%s\n' "$want" >>"$ENV_FILE"
    fi
    chmod 600 "$ENV_FILE"
    echo "已备份到 $backup，写入 ALLOW_GUEST_LOGIN=$want，重建 api 容器..."
    ./scripts/compose-prod.sh up -d --force-recreate api 2>&1 | tail -3
    for _ in $(seq 1 30); do
      if curl -fsS -m 5 "$API_BASE/health/ready" >/dev/null 2>&1; then
        echo "API 已恢复：$API_BASE/health/ready"
        code="$(probe || echo 000)"
        echo "dev 登录实测：http=$code"
        exit 0
      fi
      sleep 4
    done
    echo "警告：120 秒内健康检查未通过，请查看 api 日志" >&2
    exit 1
    ;;

  *)
    echo "用法：$0 [status|on|off]" >&2
    exit 2
    ;;
esac