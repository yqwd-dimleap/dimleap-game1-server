#!/usr/bin/env bash
# 一键发布：本机代码 → 正式服务器 → 重建镜像 → 健康检查
#
#   ./deploy/deploy-prod.sh              同步代码 + 重建重启 + 健康检查
#   ./deploy/deploy-prod.sh --dry-run    只列出会被改动的文件，不做任何修改
#   ./deploy/deploy-prod.sh --sync-only  只同步代码，不重建容器
#
# 不会碰服务器上的：.env（生产密钥）、backups/（数据库备份）

set -euo pipefail

HOST="${DEPLOY_HOST:-ubuntu@81.71.134.105}"
KEY="${DEPLOY_KEY:-$HOME/.ssh/id_ed25519_github}"
REMOTE_DIR="${DEPLOY_DIR:-/opt/runestone-server}"
HEALTH_URL="${DEPLOY_HEALTH_URL:-https://api.0ygame.cn/health/ready}"

DRY_RUN=0
SYNC_ONLY=0
case "${1:-}" in
  -n | --dry-run) DRY_RUN=1 ;;
  --sync-only) SYNC_ONLY=1 ;;
  -h | --help)
    sed -n '2,10p' "$0"
    exit 0
    ;;
  "") ;;
  *)
    echo "未知参数：$1（用 --help 查看用法）" >&2
    exit 2
    ;;
esac

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

SSH_CMD="ssh -i $KEY -o BatchMode=yes -o ConnectTimeout=15 -o StrictHostKeyChecking=accept-new"
EXCLUDES=(
  --exclude '.env'
  --exclude '.env.*'
  --exclude 'backups/'
  --exclude 'node_modules/'
  --exclude 'dist/'
  --exclude '.git/'
  --exclude '._*'
  --exclude '.DS_Store'
  --exclude '.qoder*'
  --exclude '*.log'
)

section() { printf '\n==> %s\n' "$1"; }

section "0/3 检查"
dirty="$(git status --porcelain 2>/dev/null | grep -vc '^??' || true)"
if [ "${dirty:-0}" != "0" ]; then
  echo "注意：有 $dirty 个已跟踪文件未提交，本次上线的代码与 Git 仓库不一致"
fi
echo "本机：$REPO_ROOT"
echo "目标：$HOST:$REMOTE_DIR"

section "1/3 同步代码"
rsync_flags=(-a --delete --itemize-changes "${EXCLUDES[@]}")
[ "$DRY_RUN" = 1 ] && rsync_flags+=(-n)
rsync "${rsync_flags[@]}" -e "$SSH_CMD" ./ "$HOST:$REMOTE_DIR/"

if [ "$DRY_RUN" = 1 ]; then
  echo "（dry-run 结束，未做任何改动）"
  exit 0
fi

if [ "$SYNC_ONLY" = 1 ]; then
  echo "（只同步代码，未重建容器）"
  exit 0
fi

section "2/3 重建并重启容器"
$SSH_CMD "$HOST" "cd $REMOTE_DIR && chmod +x scripts/*.sh deploy/*.sh && ./scripts/compose-prod.sh up -d --build 2>&1 | tail -8 && ./scripts/compose-prod.sh ps"

section "3/3 健康检查"
for _ in $(seq 1 30); do
  if body="$(curl -fsS -m 5 "$HEALTH_URL" 2>/dev/null)"; then
    echo "$body"
    echo "发布成功：$HEALTH_URL"
    exit 0
  fi
  sleep 4
done

echo "健康检查失败：$HEALTH_URL 120 秒内未返回 200" >&2
echo "排查：$SSH_CMD $HOST 'cd $REMOTE_DIR && ./scripts/compose-prod.sh logs --tail=50 api'" >&2
exit 1
