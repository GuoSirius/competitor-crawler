import { defineEventHandler } from 'h3';
import { createDb, categories } from '@competitor-crawler/shared';

// 品类列表，供筛选器使用
export default defineEventHandler(async () => {
  const db = createDb().db;
  const rows = await db
    .select({
      id: categories.id,
      companyId: categories.companyId,
      name: categories.name,
      productLine: categories.productLine,
    })
    .from(categories)
    .orderBy(categories.name);
  return rows;
});
