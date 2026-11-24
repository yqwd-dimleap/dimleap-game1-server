# Runestone Server

符石战场的轻量后端。服务端负责登录、云存档、英雄解锁/升级、AI 难度下发、对局结算、军功奖励和排行榜；客户端继续负责 AI、Box2D 战斗、地图、表现和最终胜负。

## 技术栈

- Fastify 5 + TypeScript
- TypeBox 请求校验
- Drizzle ORM + MySQL 8.4
- Redis 7，可选榜单缓存
- JWT，有效期 7 天
- Docker Compose
- Caddy 生产环境 HTTPS

## 本地启动

前置条件：Docker Desktop 已启动。

```sh
cd /Users/zhangzhihao/Documents/MyProject1_server
npm install
npm run config:sync
npm run docker:dev:up
```

检查服务：

```sh
curl http://127.0.0.1:3000/health/ready
```

本地地址：

```text
API:  http://127.0.0.1:3000/api/v1
Docs: http://127.0.0.1:3000/docs
```

运行完整烟测：

```sh
npm run smoke
```

## 本地清档

本地测试数据库可以完整删除并重建。该命令会清除玩家、身份、英雄、对局和领奖记录，并清空 Redis 缓存：

```sh
npm run reset:dev
# 查看说明后执行：
npm run reset:dev:yes
```

清档后会重新生成 6–8 位对外 ID 号池。浏览器中已缓存的旧 JWT 会在下一次 Bootstrap 401 后自动重新登录，并创建新玩家。

查看日志或停止：

```sh
npm run docker:dev:logs
npm run docker:dev:down
```

`docker:dev:down` 不会删除 MySQL/Redis 数据卷。不要使用 `docker compose down -v`，除非明确要清空全部本地数据。

## 配置同步

游戏数值仍以当前 Cocos 项目中的 Excel → JSON 为唯一来源。

```sh
npm run config:sync
```

默认读取：

```text
../MyProject1/assets/resources/config/game
```

也可设置：

```sh
GAME_CONFIG_SOURCE=/absolute/path/to/config/game npm run config:sync
```

同步会生成：

- `config/game/*.json`
- `config/game/sha256.json`

服务端使用自己的配置副本计算 AI 难度、英雄费用和军功奖励，不接受客户端提交的费用或奖励增量。

## 排行榜机器人

机器人只用于排行榜展示：

```text
config/leaderboard-bots.json
```

不包含 AI 难度、段位、英雄等级或阵容。服务端将真实玩家和机器人按 `netStars` 合并；真实玩家同分时排在机器人前。

## API

统一前缀：

```text
/api/v1
```

业务接口：

- `POST /auth/login`
- `GET /player/bootstrap`
- `PATCH /player/profile`
- `PUT /player/lineup`
- `POST /heroes/unlock`
- `POST /heroes/upgrade`
- `POST /battles/start`
- `POST /battles/finish`
- `POST /season/rewards/claim`
- `GET /leaderboard`

健康检查：

- `GET /health/live`
- `GET /health/ready`

完整交互式文档：

```text
/docs
```

## 浏览器本地登录

非生产环境支持：

```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "provider": "dev",
  "devId": "my-local-test-player"
}
```

`devId` 相同会映射到同一玩家。正式环境默认禁止该登录方式；如确需在正式环境开放浏览器游客登录（例如前端联调），在 `.env` 设置 `ALLOW_GUEST_LOGIN=true` 后重启 API，关闭时删除该变量或设为 `false`。

玩家身份分三层：

- 内部主键 `players.id`：有符号 Int64 雪花 ID，仅数据库和 JWT 使用
- 对外数字 ID `players.public_id`：从预生成号池随机分配的 6–8 位数字
- 展示名：玩家自定义昵称；允许重名，身份以对外数字 ID 为准

对外 ID 号池由 `player_public_ids` 表管理，创建玩家时随机选取未分配号码；唯一索引冲突会自动重试。

手动补充号池：

```sh
npm run ids:seed -- --count=5000
```

容器启动时会执行一次 `--if-empty` 检查，因此首次启动或清档后会自动预生成 5000 个号码。生产多实例部署必须为每个实例配置唯一的 `SNOWFLAKE_WORKER_ID` 和 `SNOWFLAKE_DATACENTER_ID`。

## 对局流程

1. 客户端调用 `/battles/start`。
2. 服务端根据当前 `netStars` 读取 `rank_config` 和 `ai_difficulty_config`。
3. 服务端返回完整 AI 难度快照、地图 ID、随机种子和签名票据。
4. 客户端使用服务端难度运行 AI 战斗。
5. 系列赛结束后调用 `/battles/finish`，只提交 `win` 或 `loss`。
6. 同一 `battleId` 重复提交返回首次结果，不重复发奖。

当前奖励：

- 胜利：金币 +200、星数 +1、军功 +10
- 失败：金币 +100、星数 −1、军功 0
- 星数最低为 0
- 战斗不发放英雄碎片

## 英雄碎片

初始仅开放：

- 刀兵
- 弓兵
- 骑兵
- 盾兵

其他英雄初始关闭。军功领奖可发放英雄碎片；碎片达到 `unlock_fragments` 后调用 `/heroes/unlock` 正式解锁。

## Redis 降级

Redis 不是玩家数据事实源，只缓存当前赛季共享的前 100 名基础榜单。Redis 不可用时：

- 登录、存档、升级、解锁、结算和领奖正常
- 排行榜直接查询 MySQL
- `/health/ready` 返回 `redis: false`，但服务整体仍可用

## 本地环境文件

本地开发配置位于 `.env`，已被 Git 忽略。

首次搭建或丢失时可从模板恢复：

```sh
cp .env.example .env
```

正式部署前必须替换：

- MySQL 密码
- `JWT_SECRET`
- 微信 AppID/AppSecret
- 抖音 AppID/AppSecret
- `NODE_ENV=production`
- `CORS_ORIGINS`
- `API_DOMAIN`

`NODE_ENV=production` 启动时会拒绝示例 JWT 密钥和开发数据库密码，避免误用模板配置上线。

## 腾讯云轻量应用服务器部署

推荐 Ubuntu 24.04 LTS、2 核 4 GB、60 GB 以上磁盘。

安全组只开放：

- 22：SSH
- 80：HTTP/证书
- 443：HTTPS

不要向公网开放 MySQL 3306 或 Redis 6379。

服务器上安装 Docker Engine 和 Compose Plugin，然后：

```sh
git clone <你的仓库地址>
cd MyProject1_server
cp .env.example .env
```

编辑 `.env`，至少设置正式密码、`JWT_SECRET`、平台密钥、域名和：

```text
NODE_ENV=production
API_DOMAIN=api.example.com
CORS_ORIGINS=https://你的前端域名
```

构建并启动：

```sh
chmod +x scripts/*.sh deploy/*.sh
npm run docker:prod:up
```

检查：

```sh
curl https://api.example.com/health/ready
```

Caddy 会自动申请 HTTPS 证书。域名需先解析到服务器公网 IP；中国大陆服务器还需要完成域名备案。

## 数据备份

```sh
./deploy/backup.sh
```

备份写入 `backups/` 并压缩，脚本自动删除 7 天前的备份。生产环境建议使用 cron 每日执行，并定期在独立环境验证恢复。

## 当前边界

- 玩法仍由客户端判定胜负。
- 服务端决定关卡难度并限制结算，但不能证明被修改客户端中的战斗是否真实发生。
- 首期不做实时 PVP、服务端战斗模拟、管理后台和远程数值配置推送。
