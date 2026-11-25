#!/usr/bin/env bash
# 发布 H5（web-mobile）静态站点到正式服，由 Caddy 提供 https://0ygame.cn
#
#   ./deploy/deploy-h5.sh                 打包并发布
#   ./deploy/deploy-h5.sh --dry-run       只检查构建产物与体积，不上传
#   ./deploy/deploy-h5.sh --dir <路径>    指定构建目录（默认 ~/Documents/MyProject1/build/web-mobile）
#
# 前置：在 Cocos Creator 里构建「Web 手机端（web-mobile）」，产物需含 index.html 与 remote/
# 说明：本脚本覆盖 /srv/0ygame-web 下的同名文件，不删除旧版本残留文件（重建后 hash 变化会累积）。

set -euo pipefail

HOST="${DEPLOY_HOST:-ubuntu@81.71.134.105}"
KEY="${DEPLOY_KEY:-$HOME/.ssh/id_ed25519_github}"
WEB_ROOT="${WEB_ROOT:-/srv/0ygame-web}"
SITE_URL="${SITE_URL:-https://0ygame.cn}"
BUILD_DIR="${BUILD_DIR:-$HOME/Documents/MyProject1/build/web-mobile}"

DRY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1 ;;
    --dir)
      shift
      BUILD_DIR="${1:-}"
      ;;
    -h | --help)
      sed -n '2,11p' "$0"
      exit 0
      ;;
    *)
      echo "未知参数：$1" >&2
      exit 2
      ;;
  esac
  shift
done

[ -f "$BUILD_DIR/index.html" ] || {
  echo "构建目录缺少 index.html：$BUILD_DIR" >&2
  echo "请先在 Cocos Creator 构建「Web 手机端（web-mobile）」" >&2
  exit 1
}
[ -d "$BUILD_DIR/assets" ] || { echo "构建目录缺少 assets/：$BUILD_DIR" >&2; exit 1; }

echo "构建目录：$BUILD_DIR"
echo "总大小：$(du -sh "$BUILD_DIR" | cut -f1)"
if [ -d "$BUILD_DIR/remote" ]; then
  echo "远程包：$(du -sh "$BUILD_DIR/remote" | cut -f1)"
else
  echo "警告：没有 remote/ 目录，战斗等远程资源会加载失败" >&2
fi

# 校验构建产物内嵌配置：web 端远程包地址必须是非空 https
CFG_JSON="$(grep -rl '"remoteBaseUrl"' "$BUILD_DIR/assets" 2>/dev/null | head -1 || true)"
if [ -n "$CFG_JSON" ]; then
  python3 - "$CFG_JSON" <<'PY'
import json, sys
raw = json.load(open(sys.argv[1], encoding="utf-8"))

def find(node):
    if isinstance(node, dict) and "remoteBaseUrl" in node:
        return node
    if isinstance(node, list):
        for item in node:
            hit = find(item)
            if hit:
                return hit
    return None

cfg = find(raw) or {}
web = cfg.get("remoteBaseUrl", {}).get("web", "")
print("构建产物 remoteBaseUrl.web =", repr(web))
if not isinstance(web, str) or not web.startswith("https://"):
    sys.exit("错误：web 端远程包地址为空或非 https，运行时会报「远程资源 xxx 尚未配置 CDN」；请改 app.json 后重新构建")
PY
else
  echo "警告：构建产物里没找到 config，跳过地址校验" >&2
fi

if [ "$DRY" = 1 ]; then
  echo "（dry-run 结束，未上传）"
  exit 0
fi

TAR="/tmp/ds-h5-$(date +%Y%m%d-%H%M%S).tar.gz"
trap 'rm -f "$TAR"' EXIT

echo "打包..."
tar -czf "$TAR" --no-xattrs -C "$BUILD_DIR" . 2>/dev/null
echo "包大小：$(ls -lh "$TAR" | awk '{print $5}')"

echo "上传..."
scp -q -o BatchMode=yes -i "$KEY" -o StrictHostKeyChecking=accept-new "$TAR" "$HOST:/tmp/h5.tar.gz"

echo "解压到 $WEB_ROOT ..."
ssh -o BatchMode=yes -i "$KEY" -o StrictHostKeyChecking=accept-new "$HOST" \
  "WEB_ROOT='$WEB_ROOT' bash -s" <<'REMOTE'
set -euo pipefail
mkdir -p "$WEB_ROOT"
cd "$WEB_ROOT"
tar -xzf /tmp/h5.tar.gz
rm -f /tmp/h5.tar.gz
echo "已解压文件数：$(find . -type f | wc -l)"
REMOTE

echo "校验..."
MAP_CFG="$(ls "$BUILD_DIR/remote/map_bundle" 2>/dev/null | grep '^config\.' | head -1 || true)"
URLS=("$SITE_URL/")
[ -n "$MAP_CFG" ] && URLS+=("$SITE_URL/remote/map_bundle/$MAP_CFG")

FAIL=0
for url in "${URLS[@]}"; do
  code="$(curl -s -o /dev/null -m 20 -w '%{http_code}' "$url" || echo 000)"
  printf '%s  %s\n' "$code" "$url"
  [ "$code" = "200" ] || FAIL=1
done

if [ "$FAIL" = "1" ]; then
  echo "校验失败，请检查 Caddy 日志：ssh $HOST 'docker logs --tail=30 runestone-prod-caddy-1'" >&2
  exit 1
fi

cat <<EOF

发布完成：$SITE_URL
当前占用：$(ssh -o BatchMode=yes -i "$KEY" "$HOST" "du -sh $WEB_ROOT | cut -f1")
EOF