/**
 * 测试辅助：自建全新空 SQLite 测试库（docs/16 Q5 un-skip 的关键）。
 *
 * 之前 contents/backfill 集成测试依赖「仓库真实库 data/crawler.sqlite 的副本」——
 * 空文件没有表结构，CI/新机器上只能 skip。这里改用 drizzle-kit 的
 * pushSQLiteSchema 按 shared 的 schema-sqlite **程序化建全量表**，彻底自包含。
 *
 * ⚠️ 必须在动态 import shared 之前调用（db/index.ts 在模块加载时求值 dbUrl）。
 */
import fs from 'node:fs';
import path from 'node:path';

export async function createTestDb(name: string): Promise<string> {
  const dir = path.join(process.cwd(), '.tmp', 'test-db', name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const dbFile = path.join(dir, 'test.sqlite');
  process.env.DATABASE_URL = dbFile;
  delete process.env.DB_DIALECT;

  // better-sqlite3 / drizzle-kit 都从 shared 的依赖上下文解析（pnpm 严格模式）
  const { createRequire } = await import('node:module');
  const req = createRequire(path.join(process.cwd(), 'packages', 'shared', 'src', 'index.ts'));
  const Database = req('better-sqlite3');
  const raw = new Database(dbFile);
  raw.pragma('journal_mode = WAL'); // 与真实库同模式

  try {
    const kit = req('drizzle-kit/api');
    // pushSQLiteSchema 的 `to` 必须是 drizzle 包装实例（内部调 db.all/db.run），裸 better-sqlite3 不行；
    // 它自己会 generateSQLiteDrizzleJson，直接把 schema 模块传进去。
    // ⚠️ 不调它返回的 apply()——其内部用 db.all 执行 DDL，drizzle-orm 0.45 的 better-sqlite3
    // 会抛 "This statement does not return data"；改为拿 statementsToExecute 自己 exec。
    const { drizzle } = await import('drizzle-orm/better-sqlite3');
    const schema = await import('@competitor-crawler/shared');
    const result = await kit.pushSQLiteSchema(schema, drizzle(raw));
    for (const st of result.statementsToExecute as string[]) raw.exec(st);
  } finally {
    raw.close();
  }
  return dbFile;
}
