/**
 * 测试用的 D1 替身：用 Node 内置的 node:sqlite（Node 22.5+ 的实验特性，24 里稳定可用）
 * 实现我们实际用到的 D1 接口子集，让单测跑真 SQL 而不是手写 mock。
 *
 * 只覆盖约定用法：
 *   db.prepare(sql).bind(...).first() / .all() / .run()
 *   db.batch(statements)（用 BEGIN/COMMIT 模拟 D1 的事务批处理）
 *   db.exec(multiStatementSql)
 */
import { DatabaseSync } from 'node:sqlite';

type SqlValue = string | number | bigint | null | Uint8Array;

export interface FakeD1Statement {
  bind(...params: SqlValue[]): FakeD1Statement;
  first<T = Record<string, SqlValue>>(column?: string): Promise<T | null>;
  all<T = Record<string, SqlValue>>(): Promise<{ results: T[]; success: true; meta: Record<string, unknown> }>;
  run(): Promise<{ success: true; meta: { last_row_id: number; changes: number } }>;
}

export interface FakeD1 {
  prepare(sql: string): FakeD1Statement;
  batch(statements: FakeD1Statement[]): Promise<Array<Awaited<ReturnType<FakeD1Statement['run']>>>>;
  exec(sql: string): Promise<{ count: number; duration: number }>;
  /** 直接查库用（断言落库结果），不暴露给业务代码。 */
  raw: DatabaseSync;
}

function statement(raw: DatabaseSync, sql: string, params: SqlValue[]): FakeD1Statement {
  return {
    bind(...next) {
      return statement(raw, sql, [...params, ...next]);
    },
    async first<T>(column?: string) {
      const row = raw.prepare(sql).get(...params) as Record<string, SqlValue> | undefined;
      if (!row) return null;
      return (column ? row[column] : row) as T;
    },
    async all<T>() {
      return { results: raw.prepare(sql).all(...params) as T[], success: true as const, meta: {} };
    },
    async run() {
      const info = raw.prepare(sql).run(...params);
      return {
        success: true as const,
        meta: { last_row_id: Number(info.lastInsertRowid), changes: Number(info.changes) },
      };
    },
  };
}

export function createFakeD1(): FakeD1 {
  const raw = new DatabaseSync(':memory:');
  return {
    raw,
    prepare(sql: string) {
      return statement(raw, sql, []);
    },
    async batch(statements) {
      raw.exec('BEGIN');
      try {
        const results = [];
        for (const item of statements) results.push(await item.run());
        raw.exec('COMMIT');
        return results;
      } catch (error) {
        raw.exec('ROLLBACK');
        throw error;
      }
    },
    async exec(sql: string) {
      raw.exec(sql);
      return { count: 0, duration: 0 };
    },
  };
}
