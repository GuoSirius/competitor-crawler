import { defineEventHandler, getRouterParam, createError } from 'h3';
import { eq } from '@competitor-crawler/shared';
import { createDb, products, companies, categories, sections } from '@competitor-crawler/shared';

// 产品详情（含公司 / 品类名 + 原始 row JSON）
export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'));
  if (!Number.isInteger(id)) throw createError({ statusCode: 400, statusMessage: 'invalid id' });
  const db = createDb().db;
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      englishName: products.englishName,
      brand: products.brand,
      detailUrl: products.detailUrl,
      price: products.price,
      currency: products.currency,
      priceText: products.priceText,
      specText: products.specText,
      description: products.description,
      specs: products.specs,
      introMedia: products.introMedia,
      cloneNumber: products.cloneNumber,
      applications: products.applications,
      row: products.row,
      status: products.status,
      sectionKey: sections.key,
      firstSeenAt: products.firstSeenAt,
      lastSeenAt: products.lastSeenAt,
      company: companies.name,
      category: categories.name,
    })
    .from(products)
    .leftJoin(companies, eq(products.companyId, companies.id))
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .leftJoin(sections, eq(products.sectionId, sections.id))
    .where(eq(products.id, id))
    .limit(1);
  if (rows.length === 0) throw createError({ statusCode: 404, statusMessage: 'not found' });
  return rows[0];
});
