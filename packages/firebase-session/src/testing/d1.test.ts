// SQLite 기반 D1의 바인딩·트랜잭션·마이그레이션을 시험한다.
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createTestD1, type TestD1 } from './d1.js';

const databases: TestD1[] = [];
const directories: string[] = [];
function database(o?: Parameters<typeof createTestD1>[0]) {
  const db = createTestD1(o);
  databases.push(db);
  return db;
}
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('시험용 D1', () => {
  it('기본은 빈 DB이고 외래 키 검사를 켠다', async () => {
    const db = database();
    expect(
      (await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()).results,
    ).toEqual([]);
    expect(await db.prepare('PRAGMA foreign_keys').first()).toEqual({ foreign_keys: 1 });
    db.raw.exec(
      'CREATE TABLE parent (id INTEGER PRIMARY KEY); CREATE TABLE child (id INTEGER REFERENCES parent(id))',
    );
    await expect(db.prepare('INSERT INTO child VALUES (1)').run()).rejects.toThrow();
  });
  it.each([null, '문자열', 42, 1.5, new Uint8Array([1, 2]), new Uint8Array([3, 4]).buffer])(
    '지원하는 값을 바인딩한다: %s',
    async (value) => {
      const db = database();
      const row = await db.prepare('SELECT ? AS value').bind(value).first<{ value: unknown }>();
      const expected = value instanceof ArrayBuffer ? new Uint8Array(value) : value;
      expect(row).toEqual({ value: expected });
      expect(Object.getPrototypeOf(row)).toBe(Object.prototype);
    },
  );
  it.each([undefined, true, false, {}, [], 1n, new Int16Array([1])])(
    '지원하지 않는 바인딩은 즉시 거절한다: %s',
    (value) => {
      expect(() => database().prepare('SELECT ?').bind(value)).toThrow(TypeError);
    },
  );
  it('?1 번호 매개변수를 재사용하며 SQL 문자열은 바꾸지 않는다', async () => {
    expect(
      await database()
        .prepare("SELECT ?1 AS a, ?1 AS b, ?2 AS c, '?1' AS literal")
        .bind(7, '값')
        .first(),
    ).toEqual({ a: 7, b: 7, c: '값', literal: '?1' });
  });
  it('bind는 새 문장을 만들고 빈 결과 first는 null이다', async () => {
    const db = database();
    const statement = db.prepare('SELECT ? AS n');
    const a = statement.bind(1);
    const b = statement.bind(2);
    expect(await a.first()).toEqual({ n: 1 });
    expect(await b.first()).toEqual({ n: 2 });
    expect(await db.prepare('SELECT 1 WHERE 0').first()).toBeNull();
  });
  it('PRAGMA·SELECT는 행과 changes 0을 돌려준다', async () => {
    const db = database();
    for (const result of [
      await db.prepare('PRAGMA foreign_keys').all(),
      await db.prepare('SELECT 1 AS n').run(),
    ]) {
      expect(result).toMatchObject({ success: true, meta: { changes: 0 } });
      expect(result.results).toHaveLength(1);
    }
  });
  it('INSERT RETURNING과 일반 변경문의 changes를 센다', async () => {
    const db = database();
    expect(
      await db.prepare('CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT)').run(),
    ).toMatchObject({ results: [], success: true, meta: { changes: 0 } });
    expect(
      await db.prepare("INSERT INTO items VALUES (1, '하나') RETURNING id, name").all(),
    ).toEqual({ results: [{ id: 1, name: '하나' }], success: true, meta: { changes: 1 } });
    expect((await db.prepare("UPDATE items SET name = '둘'").run()).meta.changes).toBe(1);
    expect((await db.prepare('DELETE FROM items').run()).meta.changes).toBe(1);
  });
  it('batch 성공을 커밋하고 주입한 실패는 한 번만 롤백한다', async () => {
    const db = database();
    db.raw.exec('CREATE TABLE items (n INTEGER UNIQUE)');
    const statements = [
      db.prepare('INSERT INTO items VALUES (1)'),
      db.prepare('INSERT INTO items VALUES (2)'),
    ];
    db.failNextBatchAt(1);
    await expect(db.batch(statements)).rejects.toThrow();
    expect((await db.prepare('SELECT * FROM items').all()).results).toEqual([]);
    expect(await db.batch(statements)).toEqual([
      { results: [], success: true, meta: { changes: 1 } },
      { results: [], success: true, meta: { changes: 1 } },
    ]);
    await expect(
      db.batch([
        db.prepare('INSERT INTO items VALUES (3)'),
        db.prepare('INSERT INTO items VALUES (1)'),
      ]),
    ).rejects.toThrow();
    expect((await db.prepare('SELECT n FROM items ORDER BY n').all()).results).toEqual([
      { n: 1 },
      { n: 2 },
    ]);
  });
  it('다른 DB의 문장과 외부 구현을 거절하고 롤백한다', async () => {
    const db = database();
    const other = database();
    db.raw.exec('CREATE TABLE items (n INTEGER)');
    for (const statement of [
      other.prepare('SELECT 1'),
      {
        bind: () => other.prepare('SELECT 1'),
        first: async () => null,
        all: async () => ({ results: [], success: true, meta: { changes: 0 } }),
        run: async () => ({ results: [], success: true, meta: { changes: 0 } }),
      },
    ]) {
      await expect(
        db.batch([db.prepare('INSERT INTO items VALUES (1)'), statement]),
      ).rejects.toThrow(TypeError);
      expect((await db.prepare('SELECT * FROM items').all()).results).toEqual([]);
    }
  });
  it.each(['path', 'url'])(
    '마이그레이션을 파일 이름순으로 through까지 포함한다: %s',
    async (kind) => {
      const dir = mkdtempSync(join(tmpdir(), 'firebase-session-d1-'));
      directories.push(dir);
      writeFileSync(join(dir, '0003.sql'), 'INSERT INTO items VALUES (3)');
      writeFileSync(join(dir, '0002.sql'), 'INSERT INTO items VALUES (2)');
      writeFileSync(
        join(dir, '0001.sql'),
        'CREATE TABLE items (n INTEGER); INSERT INTO items VALUES (1)',
      );
      writeFileSync(join(dir, 'ignore.txt'), '틀린 SQL');
      const migrations = kind === 'url' ? pathToFileURL(dir) : dir;
      expect(
        (await database({ migrations, through: '0002.sql' }).prepare('SELECT * FROM items').all())
          .results,
      ).toEqual([{ n: 1 }, { n: 2 }]);
      expect(
        (await database({ migrations }).prepare('SELECT * FROM items').all()).results,
      ).toHaveLength(3);
    },
  );
  it('interleave가 켜져 있으면 first·all·run 전에 매크로태스크로 양보한다', async () => {
    const db = database();
    expect(db.interleave).toBe(false);
    for (const method of ['first', 'all', 'run'] as const) {
      for (const interleave of [false, true]) {
        db.interleave = interleave;
        let yielded = false;
        const scheduled = new Promise<void>((resolve) =>
          setTimeout(() => {
            yielded = true;
            resolve();
          }, 0),
        );
        await db.prepare('SELECT 1')[method]();
        expect(yielded).toBe(interleave);
        await scheduled;
      }
    }
  });
  it('close는 SQLite 연결을 닫는다', () => {
    const db = createTestD1();
    db.close();
    expect(() => db.raw.prepare('SELECT 1')).toThrow();
  });
});
