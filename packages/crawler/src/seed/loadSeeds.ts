import fs from 'node:fs';
import { and, eq, isNull } from 'drizzle-orm';
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

  // 2) 品类 upsert（按 公司 + 产品线 + 品类名）
  for (const s of seeds) {
    const companyId = companyIdByName.get(s.companyName)!;
    const productLine = s.productLine ?? null;
    const key = `${companyId}|${productLine ?? ''}|${s.categoryName}`;
    seenCatKeys.add(key);

    const existing = await db
      .select()
      .from(categories)
      .where(
        and(
          eq(categories.companyId, companyId),
          productLine === null
            ? isNull(categories.productLine)
            : eq(categories.productLine, productLine),
          eq(categories.name, s.categoryName),
        ),
      )
      .limit(1);

    if (existing.length) {
      await db
        .update(categories)
        .set({ url: s.categoryUrl, sourceRow: s.sourceRow, removedAt: null, updatedAt: t })
        .where(eq(categories.id, existing[0].id));
    } else {
      await db.insert(categories).values({
        companyId,
        productLine,
        name: s.categoryName,
        url: s.categoryUrl,
        sourceRow: s.sourceRow,
        removedAt: null,
        createdAt: t,
        updatedAt: t,
      });
    }
  }

  // 3) 软标记本轮消失的品类（种子源删除）
  const allCats = await db.select().from(categories);
  for (const c of allCats) {
    const key = `${c.companyId}|${c.productLine ?? ''}|${c.name}`;
    if (!seenCatKeys.has(key) && c.removedAt == null) {
      await db.update(categories).set({ removedAt: t, updatedAt: t }).where(eq(categories.id, c.id));
    }
  }

  return { companies: companyIdByName.size, categories: seeds.length };
}
