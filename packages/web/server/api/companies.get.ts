import { defineEventHandler } from 'h3';
import { createDb, companies } from '@competitor-crawler/shared';

// 公司列表（含产品数），供筛选器与统计使用
export default defineEventHandler(async () => {
  const db = createDb().db;
  const rows = await db
    .select({
      id: companies.id,
      name: companies.name,
      website: companies.website,
      role: companies.role,
    })
    .from(companies)
    .orderBy(companies.name);
  return rows;
});
