// Nuxt 配置：内部竞品对标平台。
// 服务端（Nitro）直连共享 better-sqlite3 库（createDb 已在 shared 内按 repoRoot 解析，与爬虫共用同一库）。
export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  modules: ['@unocss/nuxt', '@pinia/nuxt'],
  devtools: { enabled: false },
  // 监听所有网卡：局域网内其他设备 / 手机可直接通过本机 IP 访问（不仅限 localhost）
  devServer: {
    host: '0.0.0.0',
    port: 3000,
  },
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
    // 关键：unocss 66 的 @unocss/nuxt 默认 preflight:false，不会注入基础重置，
    // 导致 <body> 保留浏览器默认 8px 外边距 → 页面四周出现一圈白边。
    // 开启后自动 import '@unocss/reset/tailwind.css'（含 body{margin:0} 等重置）。
    preflight: true,
    // 暗黑模式：unocss 66 默认即 class 策略（.dark 选择器），<html class="dark"> 由 useTheme 控制，默认暗黑
    // 主题色：贴合 Elabscience/Procell 品牌蓝
    theme: {
      colors: {
        brand: '#1668dc',
        'brand-dark': '#0e4ba8',
      },
    },
    // 通用样式令牌：改这里即可全局换肤（含暗黑适配）
    shortcuts: {
      card: 'bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 shadow-sm',
      'card-pad': 'card p-4',
      input:
        'h-8 px-2.5 rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-200 text-sm outline-none focus:border-brand transition-colors placeholder:text-gray-400 dark:placeholder:text-slate-500',
      btn: 'h-8 px-3.5 rounded-md text-sm inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
      'btn-primary': 'btn bg-brand text-white hover:bg-brand-dark',
      'btn-ghost':
        'btn border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700',
      th: 'px-3 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 whitespace-nowrap',
      td: 'px-3 py-2.5 text-sm text-gray-700 dark:text-slate-300 align-middle',
      link: 'text-brand hover:underline cursor-pointer',
      'page-title': 'text-xl font-bold text-gray-800 dark:text-slate-100',
      'menu-item':
        'flex items-center gap-2.5 mx-2 px-3 py-2 rounded-md text-sm text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-slate-100 transition-colors',
      'menu-item-active': 'bg-brand/10 text-brand dark:bg-brand/20 dark:text-blue-400 font-medium',
    },
  },
});
