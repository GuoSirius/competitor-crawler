import { defineEventHandler } from 'h3';
import { sql } from '@competitor-crawler/shared';
import { createDb, products, companies } from '@competitor-crawler/shared';

// 看板统计：各公司活跃产品数（柱状图数据）
export default defineEventHandler(async () => {
  const db = createDb().db;
  const rows = await db
    .select({
      company: companies.name,
      count: sql<number>`cast(count(*) as int)`,
    })
    .from(products)
    .innerJoin(companies, sql`${products.companyId} = ${companies.id}`)
    .where(sql`${products.status} = 'active'`)
    .groupBy(companies.name)
    .orderBy(sql`count(*) desc`);
  return rows;
});
