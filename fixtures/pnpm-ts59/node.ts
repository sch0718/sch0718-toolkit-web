// D1 선언의 보존된 node 참조만으로 Node 타입을 불러오는지 검사한다.
import { createTestD1, type TestD1 } from '@sch0718/firebase-session/testing/d1';
import type { D1Database } from '@sch0718/firebase-session/worker';

const db: TestD1 = createTestD1({
  migrations: new URL('file:///tmp/migrations/'),
  through: '0001.sql',
});
export const database: D1Database = db;
export const raw = db.raw;
export const row = raw.prepare('SELECT 1 AS n').get();
db.interleave = true;
db.failNextBatchAt(0);
db.close();
