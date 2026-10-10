import { defineEventHandler } from 'h3';
import { createDb, categories, sections, eq } from '@competitor-crawler/shared';

// 品类列表，供筛选器使用
export default defineEventHandler(async () => {
  const db = createDb().db;
  const rows = await db
    .select({
      id: categories.id,
      companyId: categories.companyId,
      sectionId: categories.sectionId,
      sectionKey: sections.key,
      name: categories.name,
      productLine: sections.productLine,
    })
    .from(categories)
    .leftJoin(sections, eq(categories.sectionId, sections.id))
    .orderBy(categories.name);
  return rows;
});
