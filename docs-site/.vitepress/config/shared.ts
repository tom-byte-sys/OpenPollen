import { defineConfig } from 'vitepress'

export const shared = defineConfig({
  title: 'HiveAgent',
  description: '安全、易用、国产化的 AI Agent 平台',

  base: '/docs/',
  appearance: 'dark',
  lastUpdated: true,
  cleanUrls: true,

  head: [
    ['link', { rel: 'icon', href: '/docs/logo.svg' }],
  ],

  themeConfig: {
    logo: '/logo.svg',
    search: {
      provider: 'local',
      options: {
        locales: {
          zh: {
            translations: {
              button: { buttonText: '搜索文档', buttonAriaLabel: '搜索文档' },
              modal: {
                noResultsText: '无法找到相关结果',
                resetButtonTitle: '清除查询条件',
                footer: { selectText: '选择', navigateText: '切换', closeText: '关闭' },
              },
            },
          },
        },
      },
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/anthropics/claude-code' },
    ],
  },
})
