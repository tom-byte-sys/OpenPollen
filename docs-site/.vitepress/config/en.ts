import { type DefaultTheme, defineConfig } from 'vitepress'

export const en = defineConfig({
  lang: 'en-US',
  description: 'Secure, easy-to-use, China-ready AI Agent platform',

  themeConfig: {
    nav: nav(),
    sidebar: sidebar(),

    editLink: {
      pattern: 'https://github.com/anthropics/claude-code/edit/main/docs-site/en/:path',
      text: 'Edit this page',
    },
  },
})

function nav(): DefaultTheme.NavItem[] {
  return [
    { text: 'Guide', link: '/en/guide/introduction', activeMatch: '/en/guide/' },
    { text: 'Channels', link: '/en/channels/webchat', activeMatch: '/en/channels/' },
    { text: 'Skills', link: '/en/skills/overview', activeMatch: '/en/skills/' },
    { text: 'Reference', link: '/en/reference/config', activeMatch: '/en/reference/' },
    { text: 'Deploy', link: '/en/deployment/local', activeMatch: '/en/deployment/' },
  ]
}

function sidebar(): DefaultTheme.Sidebar {
  return {
    '/en/guide/': [
      {
        text: 'Getting Started',
        items: [
          { text: 'Introduction', link: '/en/guide/introduction' },
          { text: 'Quick Start', link: '/en/guide/quickstart' },
          { text: 'Architecture', link: '/en/guide/architecture' },
        ],
      },
    ],
    '/en/channels/': [
      {
        text: 'Channels',
        items: [
          { text: 'WebChat', link: '/en/channels/webchat' },
          { text: 'DingTalk', link: '/en/channels/dingtalk' },
          { text: 'Feishu (Lark)', link: '/en/channels/feishu' },
        ],
      },
    ],
    '/en/skills/': [
      {
        text: 'Skills',
        items: [
          { text: 'Overview', link: '/en/skills/overview' },
          { text: 'SKILL.md Format', link: '/en/skills/skillmd-format' },
        ],
      },
    ],
    '/en/reference/': [
      {
        text: 'Reference',
        items: [
          { text: 'Configuration', link: '/en/reference/config' },
          { text: 'CLI Commands', link: '/en/reference/cli' },
          { text: 'Gateway API', link: '/en/reference/api' },
        ],
      },
    ],
    '/en/deployment/': [
      {
        text: 'Deployment',
        items: [
          { text: 'Local Development', link: '/en/deployment/local' },
        ],
      },
    ],
  }
}
