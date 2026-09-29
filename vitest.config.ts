import { defineConfig } from 'vitest/config';

// 单元测试：覆盖抽取层（FieldSpec / 形态探测）、配置归一化（resolveSections）、
// 以及 web 侧纯逻辑（server/utils，docs/16 Q4）。
// 这些层是「纯函数 + 字符串输入」，最值得用测试锁住行为，避免改一处坏一处。
// web 是 Nuxt 目录结构（无 src/），按实际目录枚举；排除 .nuxt 生成物由 include 路径天然保证。
export default defineConfig({
  test: {
    include: [
      'packages/*/src/**/*.test.ts',
      'packages/web/server/**/*.test.ts',
      'packages/web/composables/**/*.test.ts',
    ],
    environment: 'node',
    reporters: ['default'],
  },
});
