import { defineEventHandler, getQuery } from 'h3';
import { and, desc, eq } from '@competitor-crawler/shared';
import { createDb, alerts } from '@competitor-crawler/shared';

// 告警列表（默认仅 open；?status=all 取全部）
export default defineEventHandler(async (event) => {
  const q = getQuery(event);
  const db = createDb().db;
  const status = q.status === 'all' ? undefined : 'open';
  const where = status ? and(eq(alerts.status, status)) : undefined;
  const rows = await db
    .select()
    .from(alerts)
    .where(where)
    .orderBy(desc(alerts.createdAt))
    .limit(200);
  return rows;
});
