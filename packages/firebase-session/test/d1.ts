// 패키지 안 시험에는 동봉한 마이그레이션을 적용한다.
import { createTestD1 as createD1, type TestD1 } from '../src/testing/d1.js';

export type { TestD1 } from '../src/testing/d1.js';

export function createTestD1(migrations?: readonly string[]): TestD1 {
  const through = migrations?.at(-1);
  return createD1({
    migrations: new URL('../migrations/', import.meta.url),
    ...(through !== undefined && { through }),
  });
}
