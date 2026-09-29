// ESLint flat config（docs/16 M1）：
// - 只管 TS 源码（packages/*/src/**/*.ts）；.vue 由 vue-tsc 负责类型，暂无 vue 插件不做 lint；
// - 规则口径：typescript-eslint recommended 为基线，但 no-explicit-any 关闭——
//   本项目在 cheerio/DomRead 边界、ExcelJS 取值等处**有意**用 any 封装（docs/12 有记录），
//   强制消除会产出大面积噪音；类型安全仍由 tsc 严格模式兜底；
// - 测试文件放宽：no-non-null-assertion 允许（断言写法在测试里更简洁）。
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.nuxt/**',
      '**/.output/**',
      '**/.data/**',
      'data/**',
    ],
  },
  {
    files: ['packages/*/src/**/*.ts'],
    extends: [...tseslint.configs.recommended],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        // 允许 _ 前缀的占位参数（onPage 的 _pageNo 等）
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['packages/*/src/**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
);
