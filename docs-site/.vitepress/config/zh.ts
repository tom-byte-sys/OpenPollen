import { type DefaultTheme, defineConfig } from 'vitepress'

export const zh = defineConfig({
  lang: 'zh-CN',
  description: '安全、易用、可扩展的开源 AI Agent 框架',

  themeConfig: {
    nav: nav(),
    sidebar: sidebar(),

    editLink: {
      pattern: 'https://github.com/tom-byte-sys/OpenPollen/edit/main/docs-site/zh/:path',
      text: '编辑此页',
    },

    docFooter: {
      prev: '上一页',
      next: '下一页',
    },

    outline: {
      label: '页面导航',
    },

    lastUpdated: {
      text: '最后更新于',
    },

    returnToTopLabel: '回到顶部',
    sidebarMenuLabel: '菜单',
    darkModeSwitchLabel: '主题',
    lightModeSwitchTitle: '切换到浅色模式',
    darkModeSwitchTitle: '切换到深色模式',
  },
})

function nav(): DefaultTheme.NavItem[] {
  return [
    { text: '指南', link: '/zh/guide/introduction', activeMatch: '/zh/guide/' },
    { text: '渠道', link: '/zh/channels/webchat', activeMatch: '/zh/channels/' },
    { text: '技能', link: '/zh/skills/overview', activeMatch: '/zh/skills/' },
    { text: '参考', link: '/zh/reference/config', activeMatch: '/zh/reference/' },
    { text: '部署', link: '/zh/deployment/local', activeMatch: '/zh/deployment/' },
  ]
}

function sidebar(): DefaultTheme.Sidebar {
  return {
    '/zh/guide/': [
      {
        text: '入门',
        items: [
          { text: '介绍', link: '/zh/guide/introduction' },
          { text: '快速开始', link: '/zh/guide/quickstart' },
          { text: '架构概览', link: '/zh/guide/architecture' },
        ],
      },
    ],
    '/zh/channels/': [
      {
        text: '渠道接入',
        items: [
          { text: 'WebChat', link: '/zh/channels/webchat' },
          { text: '钉钉', link: '/zh/channels/dingtalk' },
          { text: '飞书', link: '/zh/channels/feishu' },
          { text: 'QQ 频道', link: '/zh/channels/qq' },
          { text: 'Telegram', link: '/zh/channels/telegram' },
          { text: 'Email', link: '/zh/channels/email' },
        ],
      },
    ],
    '/zh/skills/': [
      {
        text: '技能系统',
        items: [
          { text: '技能概览', link: '/zh/skills/overview' },
          { text: 'SKILL.md 格式', link: '/zh/skills/skillmd-format' },
        ],
      },
    ],
    '/zh/reference/': [
      {
        text: '参考手册',
        items: [
          { text: '配置参考', link: '/zh/reference/config' },
          { text: 'CLI 命令', link: '/zh/reference/cli' },
          { text: 'Gateway API', link: '/zh/reference/api' },
        ],
      },
    ],
    '/zh/deployment/': [
      {
        text: '部署',
        items: [
          { text: '本地开发', link: '/zh/deployment/local' },
        ],
      },
    ],
  }
}
