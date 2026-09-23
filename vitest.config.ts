import { defineConfig } from 'vitest/config';

// 单元测试：覆盖抽取层（FieldSpec / 形态探测）与配置归一化（resolveSections）。
// 这些层是「纯函数 + 字符串输入」，最值得用测试锁住行为，避免改一处坏一处。
export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts'],
    environment: 'node',
    reporters: ['default'],
  },
});
