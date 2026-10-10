import fs from 'node:fs';
import { and, eq } from 'drizzle-orm';
import {
  companies,
  sections,
  categories,
  createDb,
  nowSeconds,
  normalizeDomain,
  type CategorySeed,
} from '@competitor-crawler/shared';

const now = nowSeconds;

/**
 * 把种子里的 role 文本归一化为枚举值：own=我方品牌，competitor=竞品。
 * 仅当明确表达「我方」时才算 own；其余（缺省/竞品/任意未知值）一律 competitor。
 */
function normalizeRole(raw: string | undefined): 'own' | 'competitor' {
  if (!raw) return 'competitor';
  const v = raw.trim().toLowerCase();
  if (v === 'own' || v === '我方' || v === '自有' || v === 'yes' || v === 'true' || v === '是') {
    return 'own';
  }
  return 'competitor';
}

/**
 * 栏目 key 归一化：保留中英文/数字/下划线/连字符，其余（含空格、斜杠、标点）替换为连字符。
 * 种子栏目以 product_line 命名，可能与 config 栏目 key 不同，但同公司内 (companyId, key) 唯一即可。
 */
function slugKey(s: string | null | undefined): string {
  const base = (s ?? '').trim().toLowerCase();
  if (!base) return 'default';
  return base.replace(/[^a-z0-9一-龥_-]/g, '-').replace(/-+/g, '-') || 'default';
}

/**
 * 读取标准 seeds.json，增量同步到 DB：
 * - 公司：按归一化域名（domain）upsert（name 仍记录，仅作业务名，不再唯一）
 * - 栏目（sections 一等公民）：按 (companyId, key) 业务主键 upsert，每 productLine 一行；产品线已上移此处
 * - 品类（categories）：按 (companyId, sectionId, path) 业务主键 upsert，挂到对应种子栏目下
 * - 本轮种子中消失的行：软标记 removedAt（物理不删）
 */
export async function loadSeeds(seedsPath: string): Promise<{ companies: number; sections: number; categories: number }> {
  const { db } = createDb();
  const seeds = JSON.parse(fs.readFileSync(seedsPath, 'utf-8')) as CategorySeed[];
  const t = now();

  const seenCompanyDomains = new Set<string>();
  const companyIdByDomain = new Map<string, number>();
  // (companyId, sectionKey) → sectionId，供品类挂接
  const sectionIdByKey = new Map<string, number>();
  const seenSectionKeys = new Set<string>();
  const seenCatKeys = new Set<string>();
  let sectionCount = 0;
  let categoryCount = 0;

  // 1) 公司 upsert（按归一化域名 domain，唯一判别键）
  for (const s of seeds) {
    const domain = normalizeDomain(s.website) || normalizeDomain(s.companyName);
    if (!domain) continue; // 既无 website 也无合法域名的行跳过
    if (companyIdByDomain.has(domain)) continue;
    const existing = await db
      .select()
      .from(companies)
      .where(eq(companies.domain, domain))
      .limit(1);
    let companyId: number;
    if (existing.length) {
      companyId = existing[0].id;
      await db
        .update(companies)
        .set({
          name: s.companyName,
          website: s.website ?? existing[0].website,
          competitorType: s.competitorType ?? existing[0].competitorType,
          role: normalizeRole(s.role),
          shortName: existing[0].shortName ?? s.companyName, // 仅首次补简称，保留人工设定
          sourceRow: s.sourceRow,
          updatedAt: t,
        })
        .where(eq(companies.id, companyId));
    } else {
      const [inserted] = await db
        .insert(companies)
        .values({
          name: s.companyName,
          domain,
          shortName: s.companyName,
          website: s.website,
          competitorType: s.competitorType,
          role: normalizeRole(s.role),
          sourceRow: s.sourceRow,
          removedAt: null,
          createdAt: t,
          updatedAt: t,
        })
        .returning();
      companyId = inserted.id;
    }
    companyIdByDomain.set(domain, companyId);
    seenCompanyDomains.add(domain);
  }

  // 2) 栏目 upsert（每 productLine 一行；无 productLine 归到 key='default'）
  // 先按 (companyId, productLine) 收集，避免重复建栏目
  for (const s of seeds) {
    const domain = normalizeDomain(s.website) || normalizeDomain(s.companyName);
    const companyId = companyIdByDomain.get(domain);
    if (companyId == null) continue;
    const key = slugKey(s.productLine);
    const mapKey = `${companyId}|${key}`;
    if (seenSectionKeys.has(mapKey)) continue;
    const sectionId = await upsertSeedSection(db, companyId, key, s.productLine ?? null, t);
    sectionIdByKey.set(`${companyId}|${s.productLine ?? ''}`, sectionId);
    sectionIdByKey.set(mapKey, sectionId);
    seenSectionKeys.add(mapKey);
    sectionCount++;
  }

  // 3) 品类 upsert（按 公司 + 栏目 + 路径 业务主键；产品线下移到 sections 表，不再作树根）
  for (const s of seeds) {
    const domain = normalizeDomain(s.website) || normalizeDomain(s.companyName);
    const companyId = companyIdByDomain.get(domain);
    if (companyId == null) continue;
    const sectionId = sectionIdByKey.get(`${companyId}|${s.productLine ?? ''}`);
    if (sectionId == null) continue;
    const catPath = s.categoryName; // 同栏目内品类路径即品类名（产品线下移为栏目，树扁平化）
    await upsertSeedCategory(db, companyId, sectionId, s.categoryName, catPath, s.categoryUrl, s.sourceRow, t);
    seenCatKeys.add(`${companyId}|${sectionId}|${catPath}`);
    categoryCount++;
  }

  // 4) 软标记本轮消失的品类（种子源删除）：按新业务主键 (companyId, sectionId, path) 对账
  const allCats = await db.select().from(categories);
  for (const c of allCats) {
    const key = `${c.companyId}|${c.sectionId}|${c.path}`;
    if (!seenCatKeys.has(key) && c.removedAt == null) {
      await db.update(categories).set({ removedAt: t, updatedAt: t }).where(eq(categories.id, c.id));
    }
  }

  // 5) 软标记本轮消失的种子栏目（source='seed' 且仅种子源维护）：按 (companyId, key) 对账
  const allSections = await db.select().from(sections).where(eq(sections.source, 'seed'));
  for (const sec of allSections) {
    const key = `${sec.companyId}|${sec.key}`;
    if (!seenSectionKeys.has(key)) {
      await db.update(sections).set({ updatedAt: t }).where(eq(sections.id, sec.id));
    }
  }

  return { companies: companyIdByDomain.size, sections: sectionCount, categories: categoryCount };
}

type SeedDb = ReturnType<typeof createDb>['db'];

/** 按 (companyId, key) 业务主键 upsert 种子栏目（sections 一等公民）；返回 sectionId */
async function upsertSeedSection(
  db: SeedDb,
  companyId: number,
  key: string,
  productLine: string | null,
  t: number,
): Promise<number> {
  const existing = await db
    .select({ id: sections.id })
    .from(sections)
    .where(and(eq(sections.companyId, companyId), eq(sections.key, key)))
    .limit(1);
  if (existing.length) {
    await db
      .update(sections)
      .set({
        productLine,
        updatedAt: t,
      })
      .where(eq(sections.id, existing[0].id));
    return existing[0].id;
  }
  const [ins] = await db
    .insert(sections)
    .values({
      companyId,
      key,
      name: productLine ?? 'default',
      contentType: 'products',
      productLine,
      source: 'seed',
      createdAt: t,
      updatedAt: t,
    })
    .returning();
  return ins.id;
}

/** 按 (companyId, sectionId, path) 业务主键 upsert 单个分类节点（seeds 数据源）；返回 { id, idPath }（id 物化路径，与 crawl 同口径） */
async function upsertSeedCategory(
  db: SeedDb,
  companyId: number,
  sectionId: number,
  name: string,
  path: string,
  url: string | null,
  sourceRow: Record<string, unknown>,
  t: number,
): Promise<{ id: number; idPath: string }> {
  const existing = await db
    .select({ id: categories.id, idPath: categories.idPath })
    .from(categories)
    .where(
      and(
        eq(categories.companyId, companyId),
        eq(categories.sectionId, sectionId),
        eq(categories.path, path),
      ),
    )
    .limit(1);
  if (existing.length) {
    const idPath = `0-${existing[0].id}`;
    await db
      .update(categories)
      .set({
        name,
        url,
        parentId: null,
        level: 0,
        sourceRow,
        removedAt: null,
        updatedAt: t,
        ...(existing[0].idPath !== idPath ? { idPath } : {}), // 自愈旧数据
      })
      .where(eq(categories.id, existing[0].id));
    return { id: existing[0].id, idPath };
  }
  const [ins] = await db
    .insert(categories)
    .values({ companyId, sectionId, parentId: null, path, name, level: 0, url, sourceRow, removedAt: null, createdAt: t, updatedAt: t })
    .returning();
  const idPath = `0-${ins.id}`;
  await db.update(categories).set({ idPath }).where(eq(categories.id, ins.id));
  return { id: ins.id, idPath };
}
