import { and, eq } from 'drizzle-orm';
import { alerts, nowSeconds, type AlertSeverity, type AlertType, type createDb } from '@competitor-crawler/shared';

type Db = ReturnType<typeof createDb>['db'];

export interface NewAlert {
  type: AlertType;
  severity: AlertSeverity;
  crawlId?: number | null;
  companyId?: number | null;
  categoryId?: number | null;
  productId?: number | null;
  message: string;
  /** 结构化细节（旧值/新值/证据/建议配置片段），供人工定位 */
  payload?: Record<string, unknown>;
}

/**
 * 记录一条告警（open）。
 * 幂等：同 `type + message` 且仍为 open 的告警已存在时**不重复插入**，避免每次 probe/crawl 刷屏。
 * @returns true=新插入 / false=已存在跳过
 */
export async function recordAlert(db: Db, a: NewAlert): Promise<boolean> {
  const dup = await db
    .select({ id: alerts.id })
    .from(alerts)
    .where(and(eq(alerts.type, a.type), eq(alerts.status, 'open'), eq(alerts.message, a.message)))
    .limit(1);
  if (dup.length > 0) return false;

  await db.insert(alerts).values({
    crawlId: a.crawlId ?? null,
    type: a.type,
    severity: a.severity,
    companyId: a.companyId ?? null,
    categoryId: a.categoryId ?? null,
    productId: a.productId ?? null,
    message: a.message,
    payload: a.payload ?? null,
    status: 'open',
    createdAt: nowSeconds(),
  });
  return true;
}
