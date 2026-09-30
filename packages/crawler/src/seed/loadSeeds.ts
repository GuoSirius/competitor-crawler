import fs from 'node:fs';
import { and, eq } from 'drizzle-orm';
import {
  companies,
  categories,
  createDb,
  nowSeconds,
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
 * 读取标准 seeds.json，增量同步到 DB：
 * - 公司：按 name upsert
 * - 品类：按 (companyId, productLine, categoryName) 业务主键 upsert
 * - 本轮种子中消失的行：软标记 removedAt（物理不删）
 */
export async function loadSeeds(seedsPath: string): Promise<{ companies: number; categories: number }> {
  const { db } = createDb();
  const seeds = JSON.parse(fs.readFileSync(seedsPath, 'utf-8')) as CategorySeed[];
  const t = now();

  const seenCatKeys = new Set<string>();
  const companyIdByName = new Map<string, number>();

  // 1) 公司 upsert（按 name）
  for (const s of seeds) {
    if (companyIdByName.has(s.companyName)) continue;
    const existing = await db
      .select()
      .from(companies)
      .where(eq(companies.name, s.companyName))
      .limit(1);
    let companyId: number;
    if (existing.length) {
      companyId = existing[0].id;
      await db
        .update(companies)
        .set({
          website: s.website ?? existing[0].website,
          competitorType: s.competitorType ?? existing[0].competitorType,
          role: normalizeRole(s.role),
          sourceRow: s.sourceRow,
          removedAt: null,
          updatedAt: t,
        })
        .where(eq(companies.id, companyId));
    } else {
      const [inserted] = await db
        .insert(companies)
        .values({
          name: s.companyName,
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
    companyIdByName.set(s.companyName, companyId);
  }

  // 2) 品类 upsert（按 公司 + 内容类型 + 路径 业务主键；产品线作根，品类挂其下）
  for (const s of seeds) {
    const companyId = companyIdByName.get(s.companyName)!;
    const productLine = s.productLine ?? null;
    const catPath = productLine ? `${productLine}/${s.categoryName}` : s.categoryName;
    let parentId: number | null = null;
    let parentIds = '0'; // idPath 以 0 起头
    if (productLine) {
      // 产品线根节点
      const root = await upsertSeedCategory(db, companyId, productLine, productLine, productLine, null, null, parentIds, 0, s.sourceRow, t);
      parentId = root.id;
      parentIds = root.idPath;
      seenCatKeys.add(`${companyId}|products|${productLine}`);
    }
    await upsertSeedCategory(db, companyId, s.categoryName, catPath, productLine, s.categoryUrl, parentId, parentIds, parentId === null ? 0 : 1, s.sourceRow, t);
    seenCatKeys.add(`${companyId}|products|${catPath}`);
  }

  // 3) 软标记本轮消失的品类（种子源删除）：按新业务主键 (companyId, contentType, path) 对账
  const allCats = await db.select().from(categories);
  for (const c of allCats) {
    const key = `${c.companyId}|products|${c.path}`;
    if (!seenCatKeys.has(key) && c.removedAt == null) {
      await db.update(categories).set({ removedAt: t, updatedAt: t }).where(eq(categories.id, c.id));
    }
  }

  return { companies: companyIdByName.size, categories: seeds.length };
}

type SeedDb = ReturnType<typeof createDb>['db'];

/** 按 (companyId, contentType, path) 业务主键 upsert 单个分类节点（seeds 数据源）；返回 { id, idPath }（id 物化路径，与 crawl 同口径） */
async function upsertSeedCategory(
  db: SeedDb,
  companyId: number,
  name: string,
  path: string,
  productLine: string | null,
  url: string | null,
  parentId: number | null,
  parentIds: string,
  level: number,
  sourceRow: Record<string, unknown>,
  t: number,
): Promise<{ id: number; idPath: string }> {
  const existing = await db
    .select({ id: categories.id, idPath: categories.idPath })
    .from(categories)
    .where(
      and(
        eq(categories.companyId, companyId),
        eq(categories.contentType, 'products'),
        eq(categories.path, path),
      ),
    )
    .limit(1);
  if (existing.length) {
    const idPath = `${parentIds}-${existing[0].id}`;
    await db
      .update(categories)
      .set({
        name, url, productLine, parentId, level, sourceRow, removedAt: null, updatedAt: t,
        ...(existing[0].idPath !== idPath ? { idPath } : {}), // 自愈旧数据
      })
      .where(eq(categories.id, existing[0].id));
    return { id: existing[0].id, idPath };
  }
  const [ins] = await db
    .insert(categories)
    .values({ companyId, contentType: 'products', parentId, path, name, level, productLine, url, sourceRow, removedAt: null, createdAt: t, updatedAt: t })
    .returning();
  const idPath = `${parentIds}-${ins.id}`;
  await db.update(categories).set({ idPath }).where(eq(categories.id, ins.id));
  return { id: ins.id, idPath };
}
