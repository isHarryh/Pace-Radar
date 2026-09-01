# Pace-Radar

节奏雷达

## 简介

监测与可视化游戏社区「节奏」现象的网页应用。

### 背景

在中国游戏市场，游戏有时会因为策划、内容质量、风评等原因，在玩家社区中引发争议，产生所谓的「节奏」。具体而言，它指的是玩家社区对游戏官方形成的集中性的质疑。它最典型的表现，是游戏官方社交账号的动态评论区涌入大量评论——玩家们用一条条评论「盖楼」，表达不满与诉求。

对于从业者与观察者而言，节奏的发酵过程往往是模糊的：它从哪里开始、有多剧烈、是昙花一现还是愈演愈烈，都难以被直观感知。节奏雷达希望让这一切变得可见。

### 目标

节奏雷达致力于监测并可视化这一现象：

- **定时采集**：后端定期采集指定游戏官方账号的动态互动数据；
- **节奏判定**：通过评论数与点赞数的比例，判断账号是否处于节奏状态；
- **全景概览**：前端一屏总览各游戏官方账号的节奏状态，节奏与否一目了然；
- **实时监控**：针对特定账号实时追踪节奏进程——已经盖了多少层楼、每分钟新增多少层、涨落曲线尽在掌握。

采集器同时支持两种部署方式：可以使用 Cloudflare Worker 和 Cron，也可以在 Linux 服务器上运行 Node.js 版本。Linux 版本支持通过 Xray、V2Ray、sing-box 或 Clash 提供的 HTTP 代理访问 B站，VMess 由代理客户端处理。两种部署方式共享同一个 D1 数据库和同一套采集逻辑。

## 部署步骤

下面的步骤假设你使用自己的 Cloudflare 账号。部署前请准备好 Node.js 22 或更高版本和 pnpm，以及一份包含完整 `SESSDATA` 的 B站 Cookie。

> Cookie、Cloudflare API Token 和管理后台 token 都属于敏感信息，只能通过本地文件、服务器环境变量或管理后台保存，不能提交到 Git 仓库。

### 1. 准备数据库

登录 Cloudflare 控制台，进入 **Storage & databases**，打开 **D1 SQLite database**，新建数据库 `pace-radar-db`。创建完成后打开数据库详情页，复制页面上的 Database ID 标识。如果你是从这个公开仓库派生自己的项目，请把 `apps/api/wrangler.toml` 和 `apps/collector/wrangler.toml` 中的 `database_id` 都替换成你自己的 ID。此 ID 不是密码，可以公开到 Git 仓库。

先在仓库根目录安装依赖并登录 Wrangler。`pnpm exec wrangler login` 会打开 Cloudflare 登录页面，授权完成后终端会保存当前账号的登录状态。

```sh
pnpm install --frozen-lockfile
pnpm exec wrangler login
```

然后在远程数据库中进行初始化（创建和升级表结构）：

```sh
pnpm exec wrangler d1 migrations apply pace-radar-db --remote --config apps/collector/wrangler.toml
```

为了填充初始数据和管理员密码，接下来需要在仓库根目录创建文件 `seed.sql`。下面的 `admin_token` 可以使用 `openssl rand -hex 32` 生成一串随机值，之后登录管理后台时会用到。

```sql
INSERT OR REPLACE INTO app_config (key, value) VALUES ('collect_interval_minutes', '5');
INSERT OR REPLACE INTO app_config (key, value) VALUES ('active_interval_minutes', '1');
INSERT OR REPLACE INTO app_config (key, value) VALUES ('admin_token', '<随机生成的管理后台 token>');
INSERT OR IGNORE INTO accounts (id, mid, name, enabled) VALUES (0, 0, '全局', 0);
```

创建完成后，执行初始数据填充：

```sh
pnpm exec wrangler d1 execute pace-radar-db --remote --config apps/collector/wrangler.toml --file seed.sql
```

执行成功后，采集间隔和管理后台 token 都会保存在 D1 中。确认这些数据已经写入后，及时删除本地的 `seed.sql`，不要把它提交到公开仓库。

### 2. 部署采集服务

采集服务可以部署为 Cloudflare Worker，也可以部署在有合适网络出口的 Linux 服务器上。两种方式使用同一套采集逻辑和同一个 D1，正常情况下只选择其中一种运行。Cloudflare Worker 的 Cron 每分钟会触发一次。由于 B站会拦截 Cloudflare 的海外数据中心出口，建议使用 Linux 部署方式。

#### a. 在 Cloudflare 部署采集服务

如果使用 **Cloudflare Worker**，请进入 Cloudflare 控制台的 **Workers & Pages**，创建应用并选择从 Git 仓库部署，连接这个 GitHub 仓库并选择 `main` 分支。项目名称填写 `pace-radar-collector`，Root directory 选择仓库根目录。各类命令字段的写法：

```sh
# 构建命令
pnpm install --frozen-lockfile && pnpm --filter @pace-radar/shared build && pnpm --filter @pace-radar/collector-core build
# 部署命令
pnpm deploy:cf:collector
```

部署成功后到 Worker 的 **Bindings** 页面确保存在名为 `DB` 的绑定（指向我们的 D1 数据库），随后前往设置页面的 **Cron Triggers** 检查每分钟的调度记录。

#### b. 在 Linux 服务器部署采集服务

如果使用 Linux 服务器，先安装 Node.js 22，再在仓库根目录构建 Node 版本：

```sh
pnpm install --frozen-lockfile
pnpm build:collector-node
```

Linux 采集器通过 Cloudflare D1 HTTP API 访问同一份数据库，因此需要在 Cloudflare 控制台的 **My Profile -> API Tokens** 中创建一个自定义 API Token，只授予当前账号的 **Account -> D1 -> Edit** 权限。然后在服务器的环境文件中填写这个 Token、Cloudflare Account ID 和 D1 Database ID：

```ini
# .env file:
CLOUDFLARE_ACCOUNT_ID=<Cloudflare account id>
D1_DATABASE_ID=<D1 database id>
CLOUDFLARE_API_TOKEN=<D1 edit API token>
```

如果 Xray、V2Ray、sing-box 或 Clash 在本机提供 HTTP 代理，再增加 `BILI_PROXY_URL=http://127.0.0.1:10809`。没有代理时保持这一项注释状态。VMess 由代理客户端处理，采集器不需要实现 VMess 协议。

仓库中的 `apps/collector-node/deploy/systemd/` 提供了 systemd service 和 timer 示例。把项目部署到 `/opt/pace-radar`，把环境文件保存为 `/etc/pace-radar/collector.env`，再安装并启动 timer：

```sh
sudo install -d -m 700 /etc/pace-radar
sudo install -m 600 apps/collector-node/.env.example /etc/pace-radar/collector.env
sudo install -m 644 apps/collector-node/deploy/systemd/pace-radar-collector.service /etc/systemd/system/
sudo install -m 644 apps/collector-node/deploy/systemd/pace-radar-collector.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now pace-radar-collector.timer
systemctl list-timers pace-radar-collector.timer
```

安装示例中的环境文件后，先编辑 `/etc/pace-radar/collector.env` 填入真实值。timer 每分钟启动一次采集进程，进程完成一轮采集后退出；采集日志可以用 `journalctl -u pace-radar-collector.service` 查看。

### 3. 部署 API 服务

API 服务使用 Cloudflare Worker 部署。回到 Cloudflare 控制台，新建 **Workers & Pages** Git 部署项目，仍然选择这个仓库的 `main` 分支。项目名称填写 `pace-radar-api`，Root directory 仍然选择仓库根目录。各类命令字段的写法：

```sh
# 构建命令
pnpm install --frozen-lockfile && pnpm --filter @pace-radar/shared build
# 部署命令
pnpm deploy:cf:api
```

部署完成后，在 Worker 详情页复制它的 `workers.dev` 地址，并在浏览器访问 `https://<你的-api-worker>.workers.dev/api/health` 确认 API 正常运行：

### 4. 部署静态网页

在 Cloudflare 控制台进入 **Workers & Pages**，创建一个 **Pages** 项目并连接同一个 GitHub 仓库。项目名称可填写 `pace-radar-web`，生产分支选择 `main`，Root directory 选择仓库根目录。构建命令填写：

```sh
pnpm install --frozen-lockfile && pnpm --filter @pace-radar/shared build && pnpm --filter @pace-radar/web build
```

构建输出目录填写：

```text
apps/web/dist
```

在 Pages 项目的 **Settings -> Environment variables** 中新增一个非加密的生产环境变量 `VITE_API_BASE`，值填写 API Worker 的完整 API 前缀，以 `/api` 结尾。

保存设置后重新部署 Pages，打开 Pages 分配的域名，确认首页能看到监控账号。随后再访问 `#/admin/login` 页面，使用前面写入 D1 的 `admin_token` 登录管理后台，以添加监控账号。

## 许可证

本项目基于 **MIT 协议**。
