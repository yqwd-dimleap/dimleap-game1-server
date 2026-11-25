#!/usr/bin/env bash
# 测试收尾：清理正式库里 provider='dev' 的游客/测试账号
# 在服务器上执行（/opt/runestone-server 下）：
#   ./deploy/clean-dev-players.sh                只统计，不删除（默认，可反复预览）
#   ./deploy/clean-dev-players.sh --apply        删除（默认先自动备份数据库）
#   ./deploy/clean-dev-players.sh --apply --no-backup
#
# 安全规则：
#   1. 只删「仅有 dev 身份」的玩家；同时绑定了 wx/tt 的玩家一律跳过，绝不误删真实账号
#   2. 默认 dry-run，必须显式 --apply 才动手
#   3. --apply 默认先执行 deploy/backup.sh，备份失败即中止
#   4. 关联数据由外键级联清除（battle_results / hero_progress / reward_claims）
#   5. 号池里占用的对外 ID 会自动置 NULL 归还

set -euo pipefail
cd "$(dirname "$0")/.."

CONT="runestone-prod-mysql-1"
APPLY=0
DO_BACKUP=1

for arg in "$@"; do
  case "$arg" in
    --apply) APPLY=1 ;;
    --no-backup) DO_BACKUP=0 ;;
    -h | --help)
      sed -n '2,15p' "$0"
      exit 0
      ;;
    *)
      echo "未知参数：$arg（用 --help 查看用法）" >&2
      exit 2
      ;;
  esac
done

[ -f .env ] || { echo "缺少 .env，请在 /opt/runestone-server 下执行" >&2; exit 1; }
docker ps --format '{{.Names}}' | grep -qx "$CONT" || { echo "MySQL 容器未运行：$CONT" >&2; exit 1; }

PW="$(grep -E '^MYSQL_ROOT_PASSWORD=' .env | cut -d= -f2-)"
[ -n "$PW" ] || { echo "读不到 MYSQL_ROOT_PASSWORD" >&2; exit 1; }

mysql_table() { docker exec -i "$CONT" mysql -uroot -p"$PW" -t runestone 2>/dev/null; }
mysql_plain() { docker exec -i "$CONT" mysql -uroot -p"$PW" -N -B runestone 2>/dev/null; }

# dev 专属玩家（必须同时满足：有 dev 身份、没有任何非 dev 身份）
DEV_ONLY_SQL="SELECT p.id FROM players p
  JOIN auth_identities a ON a.player_id = p.id AND a.provider = 'dev'
  WHERE NOT EXISTS (SELECT 1 FROM auth_identities o WHERE o.player_id = p.id AND o.provider <> 'dev')
  GROUP BY p.id"

# 混合身份玩家（有 dev 也有 wx/tt，必须跳过）
MIXED_SQL="SELECT p.id FROM players p
  WHERE EXISTS (SELECT 1 FROM auth_identities a WHERE a.player_id = p.id AND a.provider = 'dev')
    AND EXISTS (SELECT 1 FROM auth_identities o WHERE o.player_id = p.id AND o.provider <> 'dev')
  GROUP BY p.id"

guest_state="$(grep -E '^ALLOW_GUEST_LOGIN=' .env | cut -d= -f2- || true)"
if [ "$guest_state" = "true" ]; then
  echo "警告：ALLOW_GUEST_LOGIN 仍为 true —— 删完新的游客登录会立刻重建测试号"
  echo "      建议先关闭：./deploy/guest-login.sh off"
  echo
fi

DEV_IDS="$(mysql_plain <<<"$DEV_ONLY_SQL" || true)"
DEV_COUNT="$(printf '%s\n' "$DEV_IDS" | grep -cE '^[0-9]+$' || true)"
MIXED_IDS="$(mysql_plain <<<"$MIXED_SQL" || true)"
MIXED_COUNT="$(printf '%s\n' "$MIXED_IDS" | grep -cE '^[0-9]+$' || true)"
TOTAL="$(mysql_plain <<<"SELECT COUNT(*) FROM players;" | tr -d '[:space:]')"

echo "==== 当前库概况 ===="
mysql_table <<'SQL'
SELECT
  (SELECT COUNT(*) FROM players)                                                     AS players_all,
  (SELECT COUNT(*) FROM auth_identities WHERE provider='dev')                        AS dev_ids,
  (SELECT COUNT(*) FROM auth_identities WHERE provider='wx')                         AS wx_ids,
  (SELECT COUNT(*) FROM auth_identities WHERE provider='tt')                         AS tt_ids;
SQL
echo
echo "players 总数：$TOTAL    可删（纯 dev）：$DEV_COUNT    跳过（混合身份）：$MIXED_COUNT"
echo

if [ "$DEV_COUNT" = "0" ]; then
  echo "没有需要清理的纯 dev 账号，结束。"
  exit 0
fi

echo "==== 将要删除的账号 ===="
mysql_table <<SQL
SELECT p.id, p.public_id, p.nickname, GROUP_CONCAT(a.platform_uid) AS dev_ids, p.created_at
FROM players p
JOIN auth_identities a ON a.player_id = p.id AND a.provider = 'dev'
WHERE NOT EXISTS (SELECT 1 FROM auth_identities o WHERE o.player_id = p.id AND o.provider <> 'dev')
GROUP BY p.id, p.public_id, p.nickname, p.created_at
ORDER BY p.id;
SQL
echo

echo "==== 级联将清除的关联数据 ===="
mysql_table <<SQL
WITH dev_only AS ($DEV_ONLY_SQL)
SELECT 'battle_results' AS tbl, COUNT(*) AS cnt FROM battle_results WHERE player_id IN (SELECT id FROM dev_only)
UNION ALL
SELECT 'hero_progress', COUNT(*) FROM hero_progress WHERE player_id IN (SELECT id FROM dev_only)
UNION ALL
SELECT 'reward_claims', COUNT(*) FROM reward_claims WHERE player_id IN (SELECT id FROM dev_only);
SQL
echo

if [ "$MIXED_COUNT" != "0" ]; then
  echo "==== 已跳过（同时绑定了 wx/tt，不能删）===="
  mysql_table <<SQL
SELECT p.id, p.public_id, GROUP_CONCAT(a.provider) AS providers
FROM players p JOIN auth_identities a ON a.player_id = p.id
WHERE p.id IN ($(printf '%s' "$MIXED_IDS" | paste -sd, -))
GROUP BY p.id, p.public_id;
SQL
  echo
fi

if [ "$APPLY" = "0" ]; then
  echo "以上为预览，未做任何修改。确认无误后执行：$0 --apply"
  exit 0
fi

ID_LIST="$(printf '%s' "$DEV_IDS" | paste -sd, -)"
if ! printf '%s' "$ID_LIST" | grep -qE '^[0-9]+(,[0-9]+)*$'; then
  echo "玩家 ID 列表异常，已中止：$ID_LIST" >&2
  exit 1
fi

if [ "$DO_BACKUP" = "1" ]; then
  echo "==== 删除前备份 ===="
  if [ -x deploy/backup.sh ]; then
    ./deploy/backup.sh 2>&1 | grep -v "Using a password" | tail -2
  else
    echo "未找到 deploy/backup.sh，中止（如确认可加 --no-backup）" >&2
    exit 1
  fi
  echo
fi

echo "==== 执行删除 ===="
mysql_table <<SQL
START TRANSACTION;
DELETE FROM players WHERE id IN ($ID_LIST);
SELECT ROW_COUNT() AS deleted_players;
COMMIT;
SQL
echo

echo "==== 删除后 ===="
mysql_table <<'SQL'
SELECT
  (SELECT COUNT(*) FROM players)                                                     AS players_all,
  (SELECT COUNT(*) FROM auth_identities WHERE provider='dev')                        AS dev_ids,
  (SELECT COUNT(*) FROM auth_identities WHERE provider='wx')                         AS wx_ids,
  (SELECT COUNT(*) FROM auth_identities WHERE provider='tt')                         AS tt_ids,
  (SELECT COUNT(*) FROM player_public_ids WHERE assigned_player_id IS NULL)          AS free_ids;
SQL
echo
echo "==== 剩余玩家 ===="
mysql_table <<'SQL'
SELECT p.public_id, p.nickname, GROUP_CONCAT(a.provider) AS providers, p.created_at
FROM players p JOIN auth_identities a ON a.player_id = p.id
GROUP BY p.id, p.public_id, p.nickname, p.created_at
ORDER BY p.created_at;
SQL