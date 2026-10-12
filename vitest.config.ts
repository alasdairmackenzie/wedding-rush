import type { InlineConfig } from 'vitest/node';

export default {
  test: { include: ['src/**/*.test.ts'] } satisfies InlineConfig,
};
