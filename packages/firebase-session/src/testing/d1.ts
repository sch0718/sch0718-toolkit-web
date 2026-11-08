/// <reference types="node" preserve="true" />
// Node의 SQLite 위에 시험용 D1 연결을 만든다.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import type { D1Database, D1PreparedStatement, D1Result } from '../worker/d1.js';

export interface TestD1Options {
  /** SQL 파일을 이름순으로 적용할 폴더. 생략하면 빈 DB다. */
  migrations?: string | URL;
  /** 이 파일 이름까지 포함해 적용한다. */
  through?: string;
}

export interface TestD1 extends D1Database {
  readonly raw: DatabaseSync;
  /** 다음 batch 한 번을 0부터 세는 문장 위치에서 실패시킨다. */
  failNextBatchAt(index: number): void;
  /** first·all·run 전에 매크로태스크로 양보한다. */
  interleave: boolean;
  close(): void;
}

class Statement implements D1PreparedStatement {
  constructor(
    readonly raw: DatabaseSync,
    private readonly sql: string,
    private readonly interleave: () => boolean,
    private readonly values: SQLInputValue[] = [],
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    const bound = values.map((value) => {
      if (
        value === null ||
        typeof value === 'string' ||
        typeof value === 'number' ||
        value instanceof Uint8Array
      )
        return value;
      if (value instanceof ArrayBuffer) return new Uint8Array(value);
      throw new TypeError('D1에서 지원하지 않는 바인딩 값입니다.');
    });
    return new Statement(this.raw, this.sql, this.interleave, bound);
  }

  execute<T = Record<string, unknown>>(): D1Result<T> {
    const statement = this.raw.prepare(this.sql);
    if (statement.columns().length > 0) {
      const totalChanges = () =>
        Number(this.raw.prepare('SELECT total_changes() AS n').get()?.['n']);
      const before = totalChanges();
      const rows = statement.all(...this.values);
      return {
        results: rows.map((row) => ({ ...row }) as T),
        success: true,
        meta: { changes: totalChanges() - before },
      };
    }
    return {
      results: [],
      success: true,
      meta: { changes: Number(statement.run(...this.values).changes) },
    };
  }

  private async scheduled<T>(): Promise<D1Result<T>> {
    if (this.interleave()) await new Promise<void>((resolve) => setTimeout(resolve, 0));
    return this.execute<T>();
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    return (await this.scheduled<T>()).results[0] ?? null;
  }

  async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    return this.scheduled<T>();
  }

  async run(): Promise<D1Result> {
    return this.scheduled();
  }
}

export function createTestD1(o: TestD1Options = {}): TestD1 {
  const raw = new DatabaseSync(':memory:');
  try {
    raw.exec('PRAGMA foreign_keys = ON');
    if (o.migrations !== undefined) {
      const directory = o.migrations instanceof URL ? fileURLToPath(o.migrations) : o.migrations;
      for (const name of readdirSync(directory)
        .filter((name) => name.endsWith('.sql') && (o.through === undefined || name <= o.through))
        .sort()) {
        raw.exec(readFileSync(join(directory, name), 'utf8'));
      }
    }
  } catch (error) {
    raw.close();
    throw error;
  }
  let failureIndex: number | undefined;
  const db: TestD1 = {
    raw,
    interleave: false,
    prepare: (sql) => new Statement(raw, sql, () => db.interleave),
    async batch(statements) {
      const failAt = failureIndex;
      failureIndex = undefined;
      raw.exec('BEGIN');
      try {
        const results = statements.map((statement, index) => {
          if (index === failAt) throw new Error('시험용 batch 오류입니다.');
          if (!(statement instanceof Statement) || statement.raw !== raw)
            throw new TypeError('같은 DB의 문장만 실행할 수 있습니다.');
          return statement.execute();
        });
        raw.exec('COMMIT');
        return results;
      } catch (error) {
        raw.exec('ROLLBACK');
        throw error;
      }
    },
    failNextBatchAt(index) {
      failureIndex = index;
    },
    close() {
      raw.close();
    },
  };
  return db;
}
