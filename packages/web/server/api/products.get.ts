import { defineEventHandler, getQuery } from 'h3';
import { and, desc, eq, like, sql, count } from '@competitor-crawler/shared';
import { createDb, products, companies, categories, sections } from '@competitor-crawler/shared';

// 产品列表（看板核心）：支持 公司 / 品类 / 状态 / 关键词 / 是否有克隆号 过滤 + 分页
export default defineEventHandler(async (event) => {
  const q = getQuery(event);
  const db = createDb().db;

  const conds = [];
  if (q.company) conds.push(eq(companies.name, String(q.company)));
  if (q.category) conds.push(eq(categories.name, String(q.category)));
  if (q.status) conds.push(eq(products.status, String(q.status)));
  else conds.push(eq(products.status, 'active'));
  if (q.q) conds.push(like(products.name, `%${String(q.q)}%`));
  if (q.hasClone === '1')
    conds.push(sql`${products.cloneNumber} IS NOT NULL AND ${products.cloneNumber} != ''`);
  const where = conds.length ? and(...conds) : undefined;

  const page = Math.max(1, Number(q.page ?? 1));
  const pageSize = Math.min(200, Math.max(1, Number(q.pageSize ?? 50)));
  const offset = (page - 1) * pageSize;

  const items = await db
    .select({
      id: products.id,
      name: products.name,
      englishName: products.englishName,
      brand: products.brand,
      price: products.price,
      currency: products.currency,
      priceText: products.priceText,
      specText: products.specText,
      cloneNumber: products.cloneNumber,
      status: products.status,
      sectionKey: sections.key,
      detailUrl: products.detailUrl,
      lastSeenAt: products.lastSeenAt,
      company: companies.name,
      category: categories.name,
    })
    .from(products)
    .leftJoin(companies, eq(products.companyId, companies.id))
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .leftJoin(sections, eq(products.sectionId, sections.id))
    .where(where)
    .orderBy(desc(products.lastSeenAt))
    .limit(pageSize)
    .offset(offset);

  const totalRow = (
    await db
      .select({ total: count() })
      .from(products)
      .leftJoin(companies, eq(products.companyId, companies.id))
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .where(where)
      .limit(1)
  )[0];
  const total = totalRow?.total ?? 0;

  return { items, total, page, pageSize };
});
