// Nuxt 配置：内部竞品对标平台。
// 服务端（Nitro）直连共享 better-sqlite3 库（createDb 已在 shared 内按 repoRoot 解析，与爬虫共用同一库）。
export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  modules: ['@unocss/nuxt', '@pinia/nuxt'],
  devtools: { enabled: false },
  nitro: {
    // 生产部署为独立 Node 服务（便于团队内网托管）
    preset: 'node-server',
    // 把 workspace 下的 TS 共享包打进服务端 bundle，避免运行期找不到 JS
    externals: {
      traceInclude: ['@competitor-crawler/shared'],
    },
  },
  build: {
    transpile: ['@competitor-crawler/shared'],
  },
  unocss: {
    // 主题色：贴合 Elabscience/Procell 品牌蓝
    theme: {
      colors: {
        brand: '#1668dc',
        'brand-d:': '#0e4ba8',
      },
    },
  },
});
