import { defineEventHandler, getQuery } from 'h3';
import { and, desc, eq, like, count } from '@competitor-crawler/shared';
import { createDb, contents, companies } from '@competitor-crawler/shared';

// 资讯列表（contents 表）：支持 类型 / 公司 / 关键词 / 状态 过滤 + 分页
// 按发布时间倒序，无发布时间的退到 lastSeenAt 排序由前端两列合一处理
export default defineEventHandler(async (event) => {
  const q = getQuery(event);
  const db = createDb().db;

  const conds = [];
  if (q.company) conds.push(eq(companies.name, String(q.company)));
  if (q.contentType) conds.push(eq(contents.contentType, String(q.contentType)));
  if (q.status) conds.push(eq(contents.status, String(q.status)));
  else conds.push(eq(contents.status, 'active'));
  if (q.q) conds.push(like(contents.title, `%${String(q.q)}%`));
  const where = conds.length ? and(...conds) : undefined;

  const page = Math.max(1, Number(q.page ?? 1));
  const pageSize = Math.min(200, Math.max(1, Number(q.pageSize ?? 20)));
  const offset = (page - 1) * pageSize;

  const items = await db
    .select({
      id: contents.id,
      contentType: contents.contentType,
      title: contents.title,
      summary: contents.summary,
      author: contents.author,
      publishedAt: contents.publishedAt,
      detailUrl: contents.detailUrl,
      status: contents.status,
      lastSeenAt: contents.lastSeenAt,
      company: companies.name,
    })
    .from(contents)
    .leftJoin(companies, eq(contents.companyId, companies.id))
    .where(where)
    .orderBy(desc(contents.publishedAt), desc(contents.lastSeenAt))
    .limit(pageSize)
    .offset(offset);

  const totalRow = (
    await db
      .select({ total: count() })
      .from(contents)
      .leftJoin(companies, eq(contents.companyId, companies.id))
      .where(where)
      .limit(1)
  )[0];
  const total = totalRow?.total ?? 0;

  return { items, total, page, pageSize };
});
