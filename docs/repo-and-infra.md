# 仓库拆分与基础设施

## 仓库拆分策略

项目采用开源 + 私有双仓库模式，Apache 2.0 许可证覆盖开源部分。

### 公开仓库：`hiveagent`

GitHub 公开仓库，接受社区贡献。

```
hiveagent/
├── src/               # 核心框架（agent、gateway、channel、plugin、memory）
├── cli/               # CLI 工具
├── skills/            # 内置技能（SKILL.md 标准）
├── plugins/           # 插件示例（channel / skill / provider / memory 四种槽位）
├── docs/              # 技术文档（部署指南、开发文档）
├── tests/             # 测试
├── hiveagent.json.example
├── package.json
├── tsconfig.json
├── LICENSE            # Apache 2.0
└── README.md
```

### 私有仓库：`hiveagent-private`

GitHub Private 或内部 GitLab，仅团队成员可访问。

```
hiveagent-private/
├── website/           # 产品官网（agent.beebywork.com）
├── cloud/             # AgentTerm 云托管平台
├── marketplace/       # 技能市场后端
├── deploy/            # 部署脚本、Nginx 配置、CI/CD
├── scripts/           # 安装脚本（install.sh、install.ps1 等）
└── internal-docs/     # 商业文档、运营资料
```

### 引用关系

私有仓库通过 npm 包依赖公开仓库的代码，不复制源码：

```json
{
  "dependencies": {
    "hiveagent": "^0.1.0"
  }
}
```

如需引用未发布的开发版本，可用 git submodule 或 `npm link`。

---

## 产品官网部署

### 基本信息

| 项目 | 值 |
|------|-----|
| 域名 | agent.beebywork.com |
| 服务器 | 154.8.151.54 |
| 登录方式 | `ssh ubuntu@154.8.151.54`（密码认证） |
| 网站路径 | `/var/www/hiveagent/index.html` |
| Nginx 配置 | `/etc/nginx/sites-available/hiveagent` |
| HTTPS | Let's Encrypt（certbot 自动续期） |
| 证书到期 | 2026-05-17（certbot 会自动续期） |

### Nginx 配置

```nginx
server {
    server_name agent.beebywork.com;

    root /var/www/hiveagent;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    listen 443 ssl;
    ssl_certificate /etc/letsencrypt/live/agent.beebywork.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/agent.beebywork.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
}

server {
    if ($host = agent.beebywork.com) {
        return 301 https://$host$request_uri;
    }

    listen 80;
    server_name agent.beebywork.com;
    return 404;
}
```

### 更新网站

```bash
# 本地编辑 website/index.html 后上传
scp website/index.html ubuntu@154.8.151.54:/var/www/hiveagent/index.html
```

---

## 产品文档站

### 基本信息

| 项目 | 值 |
|------|-----|
| 访问地址 | https://agent.beebywork.com/docs/ |
| 默认跳转 | `/docs/zh/guide/introduction` |
| 技术框架 | VitePress 1.6.x |
| 源码目录 | `docs-site/` |
| 服务器路径 | `/var/www/hiveagent-docs/` |
| 语言 | 中文 + 英文（24 页） |

### 架构

```
docs-site/
├── package.json
├── deploy.sh                # 构建 + rsync 部署脚本
├── nginx.conf.example       # Nginx 配置参考
├── .vitepress/
│   ├── config/
│   │   ├── index.ts         # 主配置（locales 双语）
│   │   ├── shared.ts        # 共享配置（base:/docs/, 暗色主题, 本地搜索）
│   │   ├── zh.ts            # 中文 nav + sidebar
│   │   └── en.ts            # 英文 nav + sidebar
│   └── theme/
│       ├── index.ts         # 扩展默认主题
│       └── style/custom.css # 品牌色（amber 蜂巢主题）
├── zh/                      # 中文文档（12 页 P0）
├── en/                      # 英文文档（12 页 P0）
└── public/logo.svg          # Logo
```

### Nginx 配置要点

```nginx
# ^~ 前缀确保优先于正则 location，避免静态资源被主站规则拦截
location ^~ /docs/ {
    alias /var/www/hiveagent-docs/;
    try_files $uri $uri/ $uri.html =404;
}

location = /docs {
    return 302 /docs/zh/guide/introduction;
}
```

### 更新文档

```bash
cd docs-site && ./deploy.sh
```

脚本会依次执行 `npm ci` → `vitepress build` → `rsync` 到服务器。

### 产品官网入口

产品落地页（`/var/www/hiveagent/index.html`）导航栏已添加"文档/Docs"链接，指向文档站介绍页。

### DNS 配置

在腾讯云 DNS 控制台配置：

| 记录类型 | 主机记录 | 记录值 |
|---------|---------|--------|
| A | agent | 154.8.151.54 |

---

## 服务器资源分布

| 服务器 | IP | 用途 |
|--------|-----|------|
| 154 机器 | 154.8.151.54 | HiveAgent 官网、beebywork.com 落地页 |
| 202 机器 | 124.223.71.202 | lite.beebywork.com（另一产品） |
| 67 机器 | 111.229.29.67 | claude-code-saas 后端（通过腾讯云 CLB 负载均衡） |

---

## 当前状态

- [x] 官网已部署到 agent.beebywork.com（HTTPS）
- [x] `.gitignore` 已排除 `website/` 目录
- [x] 文档站已部署到 agent.beebywork.com/docs/（VitePress，中英双语 24 页）
- [x] 官网导航栏已添加文档入口
- [ ] 正式开源前拆分为双仓库
- [ ] 创建安装脚本（install.sh、install.ps1）
- [ ] npm 包发布
