import { defineConfig } from 'vitest/config';

// 纯函数数据层测试，不需要 Astro 容器，因此用最朴素的 vitest 配置。
// 好处：测试启动快（<1s），且不会因为 Astro 构建产物变化而误报。
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
