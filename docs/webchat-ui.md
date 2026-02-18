# WebChat UI 架构文档

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | **Lit 3** (Web Components) |
| 构建 | **Vite 7** + TypeScript (ES2022, strict) |
| 样式 | CSS 自定义属性 + 模块化样式表 |
| Markdown | marked + dompurify |
| 加密 | @noble/ed25519（设备认证） |
| 测试 | vitest |
| i18n | 自研 `t(key)` 翻译函数，支持中/英切换 |

无 React / Vue / Angular 等框架依赖，全部基于原生 Web Components。

## 目录结构

```
ui/
├── vite.config.ts                    # Vite 构建配置
├── src/ui/
│   ├── app.ts                        # 根组件 OpenPollenApp (LitElement)
│   ├── app-render.ts                 # 主渲染调度器
│   ├── app-view-state.ts             # 完整状态类型定义
│   ├── app-gateway.ts                # WebSocket 连接管理
│   ├── app-chat.ts                   # 聊天逻辑
│   ├── app-settings.ts               # 主题/语言/标签切换
│   ├── app-lifecycle.ts              # 生命周期钩子
│   ├── app-polling.ts                # 后台轮询
│   ├── app-channels.ts              # 渠道特定处理
│   ├── app-tool-stream.ts           # 工具输出流
│   │
│   ├── views/                        # 各标签页的渲染函数
│   │   ├── chat.ts                   # 聊天
│   │   ├── overview.ts               # 概览
│   │   ├── channels.ts               # 渠道总览
│   │   ├── channels.{平台}.ts        # 各渠道子页面
│   │   ├── agents.ts                 # 智能体
│   │   ├── config.ts                 # 配置
│   │   ├── usage.ts                  # 用量统计
│   │   ├── cron.ts                   # 定时任务
│   │   ├── sessions.ts              # 会话
│   │   ├── skills.ts                # 技能
│   │   ├── nodes.ts                 # 节点
│   │   ├── logs.ts                  # 日志
│   │   ├── debug.ts                 # 调试
│   │   └── instances.ts             # 实例
│   │
│   ├── controllers/                  # 业务逻辑 & API 调用
│   │   ├── chat.ts                   # 聊天 RPC
│   │   ├── config.ts                 # 配置读写
│   │   ├── agents.ts                 # 智能体管理
│   │   └── ...
│   │
│   ├── chat/                         # 聊天相关工具
│   │   ├── grouped-render.ts         # 消息分组渲染
│   │   ├── tool-cards.ts            # 工具输出卡片
│   │   └── message-normalizer.ts    # 消息标准化
│   │
│   ├── i18n/                         # 国际化
│   │   ├── index.ts                  # t(), setLocale(), onLocaleChange()
│   │   ├── types.ts                  # TranslationKey 类型（~1200 key）
│   │   ├── en.ts                     # 英文
│   │   └── zh.ts                     # 中文
│   │
│   ├── gateway.ts                    # WebSocket 客户端
│   ├── storage.ts                    # localStorage 持久化
│   ├── navigation.ts                 # 路由/标签管理
│   ├── theme.ts                      # 主题系统
│   ├── format.ts                     # 格式化工具
│   ├── presenter.ts                  # 展示层格式化
│   └── types.ts                      # Gateway 数据类型
│
└── styles/
    ├── base.css                      # 设计系统（颜色/字体/间距）
    ├── layout.css                    # 布局
    ├── components.css                # 通用组件
    ├── config.css                    # 配置页样式
    ├── chat/                         # 聊天页样式
    └── layout.mobile.css             # 移动端适配
```

## 架构模式

### 单根组件 + 函数式视图

```
OpenPollenApp (@customElement)
  │
  ├── @state() 属性 (100+ 个响应式状态)
  │
  └── render() → renderApp(state)
        │
        ├── renderChat(props)       ← 纯函数，返回 html``
        ├── renderConfig(props)
        ├── renderAgents(props)
        └── ...其他视图
```

- **根组件** `OpenPollenApp` 是唯一的 LitElement 子类，持有全部状态
- **视图函数** 是纯函数（非组件），接收 props 返回 `html` 模板
- 任何 `@state()` 属性变化 → Lit 自动触发 `render()` → 整棵视图树更新

### 数据流（单向）

```
用户操作 → 事件回调 → 修改 @state 属性 → Lit 自动重渲染
                                  ↑
Gateway 事件 → onEvent() handler ─┘
```

### 状态管理

无 Redux/Vuex，全部状态集中在 `app.ts` 的 `@state()` 属性中：

```typescript
// app.ts
@state() connected = false;
@state() chatMessages: ChatMessage[] = [];
@state() tab: Tab = "chat";
@state() locale: Locale | null = null;
// ... 100+ 更多
```

状态持久化通过 `storage.ts` 写入 localStorage（key: `openpollen.control.settings.v1`），包括 gateway URL、token、主题、语言、分栏比例等。

## Gateway 通信

WebSocket 客户端 (`gateway.ts`) 实现：

- **协议**：JSON 帧，`{ type: "res"|"event", ... }`
- **RPC 调用**：请求/响应模式，带序列号
- **事件流**：服务端推送事件（聊天消息、工具输出、健康状态）
- **认证**：Ed25519 设备签名 + token 认证，HTTP 环境回退到 token-only
- **重连**：指数退避（800ms → 15s）

## 路由系统

基于 URL 的标签切换（`navigation.ts`）：

| 分组 | 标签 | 路径 |
|------|------|------|
| 聊天 | chat | `/chat` |
| 控制 | overview, channels, instances, sessions, usage, cron | `/overview` ... |
| 智能体 | agents, skills, nodes | `/agents` ... |
| 设置 | config, debug, logs | `/config` ... |

- `window.history.pushState()` 同步 URL
- 支持浏览器前进/后退
- 支持 base path 部署到子目录

## 国际化 (i18n)

模块级 `t(key)` 函数，无外部依赖：

```typescript
t('chat.send')                        // → "发送" 或 "Send"
t('skills.shown', { count: 42 })      // → "42 个" 或 "42 shown"
```

- 切换语言 → `setLocale()` → 通知所有监听者 → 根组件 `@state() locale` 变化 → 重渲染
- 首次加载根据 `navigator.language` 自动检测
- 语言偏好保存到 localStorage

**添加新翻译**：在 `types.ts` 加 key 类型 → 在 `en.ts` / `zh.ts` 加翻译 → 在视图中调用 `t('key')`

## 样式系统

CSS 自定义属性驱动的设计系统：

```css
/* 主题色 */
--bg, --bg-accent, --bg-elevated
--text, --text-strong, --muted
--accent (#ff5c5c), --accent-2 (teal)
--ok (green), --destructive (red), --warn (orange)

/* 字体 */
--font-sans: Space Grotesk
--font-mono: JetBrains Mono
```

- **主题切换**：`system` / `light` / `dark`，通过 CSS 类 + `prefers-color-scheme` 实现
- **响应式**：`layout.mobile.css` 处理移动端

## 开发命令

```bash
npm run build:ui      # 生产构建 → dist/control-ui/
npm run dev           # Vite 开发服务器 (HMR)
npm run test          # vitest 测试
npm run typecheck     # tsc --noEmit 类型检查
```

## 添加新页面/标签

1. `navigation.ts` — 在 `TAB_GROUPS` 添加标签定义，在 `TAB_PATHS` 添加路径
2. `views/xxx.ts` — 创建渲染函数 `renderXxx(props: XxxProps)`
3. `app-render.ts` — 在 `renderApp()` 中添加分支调用新渲染函数
4. `app.ts` — 添加所需的 `@state()` 属性
5. `controllers/xxx.ts` — 添加数据加载逻辑
6. `i18n/` — 添加翻译 key

## 添加新翻译 key

1. `i18n/types.ts` — 添加 `'prefix.keyName': string;`
2. `i18n/en.ts` — 添加英文翻译
3. `i18n/zh.ts` — 添加中文翻译
4. 视图文件中 — `import { t } from "../i18n/index.ts"` 然后使用 `t('prefix.keyName')`

## 关键设计决策

| 决策 | 理由 |
|------|------|
| Lit 而非 React/Vue | 原生 Web Components，零运行时框架开销，适合嵌入式 UI |
| 单组件而非组件树 | 视图全是纯函数，简化状态传递，避免 prop drilling |
| 自研 i18n | 只需 ~50 行代码，避免引入 i18next 等重依赖 |
| WebSocket 而非 REST | 实时事件推送（聊天、工具输出、状态变化） |
| CSS 自定义属性 | 主题切换简单，无 CSS-in-JS 运行时成本 |
| 无 Shadow DOM（根组件） | 全局样式表直接生效，简化样式管理 |
