import ExcelJS from 'exceljs';
import fs from 'node:fs';
import path from 'node:path';
import { genSite, type GenSiteOpts } from './genSite.js';
import { BATCH_DEFAULT_FILE } from './genSiteTemplate.js';

export interface BatchRow extends GenSiteOpts {
  /** Excel 物理行号（含表头从 1 起），便于报错定位 */
  rowNo: number;
}

export interface GenSiteBatchOpts {
  /** 批量表路径；缺省读 BATCH_DEFAULT_FILE */
  file?: string;
  /** 仅解析并打印待生成清单，不调用模型（不落盘配置） */
  dryRun?: boolean;
}

/** 列名关键字 → 字段（0-based 列下标），大小写不敏感 */
const FIELD_KEYWORDS: Array<{ field: keyof GenSiteOpts; keys: string[] }> = [
  { field: 'domain', keys: ['domain', '域名'] },
  { field: 'listUrl', keys: ['listurl', '列表页', 'list-url', 'list_url'] },
  { field: 'detailUrl', keys: ['detailurl', '详情页', 'detail-url', 'detail_url'] },
  { field: 'companyKey', keys: ['companykey', '公司', 'company', '归属公司'] },
  { field: 'render', keys: ['render', '渲染'] },
  { field: 'notes', keys: ['notes', '备注', '说明'] },
];

function detectColumns(headers: (string | null)[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const { field, keys } of FIELD_KEYWORDS) {
    const i = headers.findIndex((h) => h != null && keys.some((k) => h.toLowerCase().includes(k.toLowerCase())));
    if (i >= 0) map[field] = i;
  }
  return map;
}

function cellText(cell: ExcelJS.Cell): string | null {
  const v = cell.value;
  if (v == null) return null;
  let t: string;
  if (typeof v === 'object' && v !== null && 'text' in (v as unknown as Record<string, unknown>)) {
    t = String((v as unknown as { text: unknown }).text);
  } else {
    t = String(v);
  }
  const trimmed = t.trim();
  return trimmed || null;
}

/**
 * 解析批量表 → 待生成站点列表（纯解析，不调模型）。
 * 供 dry-run 与真正执行共用；解析失败时抛出明确错误（列缺失 / 文件缺失）。
 */
export async function parseBatchRows(file: string): Promise<BatchRow[]> {
  if (!fs.existsSync(file)) {
    throw new Error(`未找到批量表: ${file}（可先执行 pnpm gen-site:template 生成模板）`);
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.getWorksheet(1);
  if (!ws) throw new Error(`批量表 ${file} 没有可读取的工作表`);

  // 表头（1-based 列 → headers[col-1]）
  const headerRow = ws.getRow(1);
  const headers: (string | null)[] = [];
  headerRow.eachCell((cell, col) => {
    const t = cellText(cell);
    headers[col - 1] = t;
  });

  const col = detectColumns(headers);
  if (col.domain == null || col.listUrl == null) {
    const present = Object.keys(col).join(', ') || '(无)';
    throw new Error(
      `批量表缺少必要列「域名(domain)」与「列表页URL(listUrl)」（当前识别到的列：${present}）`,
    );
  }

  const rows: BatchRow[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const domain = cellText(row.getCell(col.domain + 1));
    const listUrl = cellText(row.getCell(col.listUrl + 1));
    if (!domain || !listUrl) continue; // 跳过空行 / 缺关键列的脏行

    const get = (f: keyof GenSiteOpts): string | undefined => {
      const i = col[f];
      if (i == null) return undefined;
      return cellText(row.getCell(i + 1)) ?? undefined;
    };

    rows.push({
      rowNo: r,
      domain,
      listUrl,
      detailUrl: get('detailUrl'),
      companyKey: get('companyKey'),
      render: get('render'),
      notes: get('notes'),
    });
  }
  return rows;
}

/**
 * 批量生成站点配置：读取 Excel → 逐行调用 genSite（模型驱动）。
 * 失败隔离：单行失败只记失败并继续；末尾汇总成功 / 失败数。
 */
export async function genSiteBatch(opts: GenSiteBatchOpts = {}): Promise<void> {
  const file = opts.file ?? BATCH_DEFAULT_FILE;
  const rows = await parseBatchRows(file);

  if (rows.length === 0) {
    console.log(`[gen-site-batch] 没有可生成的行（file=${file}）；请先在「站点清单」填写站点并删除示例行`);
    return;
  }

  console.log(
    `[gen-site-batch] 解析到 ${rows.length} 个站点${opts.dryRun ? '（dry-run：仅解析，不调用模型、不落盘）' : ''}`,
  );

  let ok = 0;
  let fail = 0;
  for (const row of rows) {
    const { rowNo, ...genOpts } = row;
    if (opts.dryRun) {
      const extra = [
        genOpts.detailUrl ? `detailUrl=${genOpts.detailUrl}` : null,
        genOpts.companyKey ? `companyKey=${genOpts.companyKey}` : null,
        genOpts.render ? `render=${genOpts.render}` : null,
        genOpts.notes ? `notes=${genOpts.notes}` : null,
      ]
        .filter(Boolean)
        .join(' ');
      console.log(`  [dry] 第${rowNo}行 → domain=${genOpts.domain} listUrl=${genOpts.listUrl}${extra ? ' ' + extra : ''}`);
      continue;
    }
    try {
      console.log(`\n=== 第${rowNo}行 / 共${rows.length} → ${genOpts.domain} ===`);
      await genSite(genOpts);
      ok++;
    } catch (e) {
      fail++;
      console.error(`  ✗ 第${rowNo}行 ${genOpts.domain} 失败：${(e as Error).message}`);
    }
  }

  console.log(`\n[gen-site-batch] 完成：成功 ${ok} / 失败 ${fail} / 共 ${rows.length}`);
}
