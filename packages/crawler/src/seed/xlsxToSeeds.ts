import ExcelJS from 'exceljs';
import fs from 'node:fs';
import path from 'node:path';
import { dataDir } from '@competitor-crawler/shared';

// 路径统一由 shared/src/paths.ts 提供（避免各处重复上溯算错层级）
const seedsDir = path.join(dataDir, 'seeds');
const outFile = path.join(seedsDir, 'seeds.json');

export interface RawSeed {
  companyName: string;
  website?: string;
  competitorType?: string;
  productLine?: string;
  categoryName: string;
  categoryUrl: string;
  sourceRow: Record<string, unknown>;
}

function cellText(cell: ExcelJS.Cell): string | null {
  const v = cell.value;
  if (v == null) return null;
  if (typeof v === 'string') return v.trim() || null;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object' && 'text' in (v as unknown as Record<string, unknown>)) {
    const t = String((v as unknown as Record<string, unknown>).text);
    return t.trim() || null;
  }
  const t = cell.text;
  return typeof t === 'string' ? t.trim() || null : null;
}

function cellUrl(cell: ExcelJS.Cell): string | null {
  const hl = (cell as unknown as { hyperlink?: { target?: string; text?: string } }).hyperlink;
  if (hl?.target && /^https?:\/\//.test(hl.target)) return hl.target.trim();
  if (hl?.text && /^https?:\/\//.test(hl.text)) return hl.text.trim();
  const t = cellText(cell);
  if (t && /^https?:\/\//.test(t)) return t;
  return null;
}

function detectColumns(headers: (string | null)[]): Record<string, number> {
  const idx = (...keys: string[]) =>
    headers.findIndex((h) => h != null && keys.some((k) => h.includes(k)));
  const map: Record<string, number> = {};
  const company = idx('公司', '竞对');
  if (company >= 0) map.company = company;
  const line = idx('产品线');
  if (line >= 0) map.productLine = line;
  const cat = idx('品类');
  if (cat >= 0) map.category = cat;
  // 品类链接列：明确优先「竞品品类链接 / 品类链接」（即真实品类/列表页），
  // 不能误命中「官网链接」——否则种子全变首页，爬不动。
  const catLink = idx('竞品品类链接', '品类链接');
  if (catLink >= 0) map.catLink = catLink;
  // 官网/首页列：用于公司官网，也是品类链接缺失时的兜底。
  const homepage = idx('官网链接', '官网', '域名');
  if (homepage >= 0) map.homepage = homepage;
  // 通用 URL 列（无上述专用列时兜底）。
  const generic = idx('链接', '网址', 'URL');
  if (generic >= 0) map.genericUrl = generic;
  const type = idx('类型');
  if (type >= 0) map.type = type;
  // categoryUrl 来源优先级：品类链接 > 官网首页 > 通用 URL
  map.url = catLink >= 0 ? catLink : homepage >= 0 ? homepage : generic;
  // website 来源优先级：官网首页 > 通用 URL
  map.website = homepage >= 0 ? homepage : generic;
  return map;
}

/**
 * 读取 data/seeds 下所有 xlsx，按表头关键字定位列，
 * 品类链接优先取 cell.hyperlink.target，否则取 http(s) 文本，
 * 输出标准 seeds.json（见 docs/01 提取规则）。
 */
export async function xlsxToSeeds(): Promise<string> {
  if (!fs.existsSync(seedsDir)) {
    throw new Error(`未找到种子目录: ${seedsDir}（请先把竞对清单 xlsx 放入该目录）`);
  }
  const files = fs
    .readdirSync(seedsDir)
    .filter((f) => f.toLowerCase().endsWith('.xlsx'));
  if (files.length === 0) {
    throw new Error(`种子目录中没有 .xlsx 文件: ${seedsDir}`);
  }
  const seeds: RawSeed[] = [];

  for (const file of files) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(path.join(seedsDir, file));
    for (const ws of wb.worksheets) {
      const headerRow = ws.getRow(1);
      const headers: (string | null)[] = [];
      headerRow.eachCell((cell, col) => {
        headers[col] = cellText(cell);
      });
      const col = detectColumns(headers);
      if (col.company == null || col.category == null || col.url == null) continue;

      for (let r = 2; r <= ws.rowCount; r++) {
        const row = ws.getRow(r);
        const companyName = cellText(row.getCell(col.company)) ?? '';
        const categoryName = cellText(row.getCell(col.category)) ?? '';
        // 品类链接优先；该列为空（如赛默飞）时回退官网首页，保证品类至少被播种而不整行丢弃
        const categoryUrl =
          (col.catLink != null ? cellUrl(row.getCell(col.catLink)) : undefined) ??
          (col.homepage != null ? cellUrl(row.getCell(col.homepage)) : undefined) ??
          (col.genericUrl != null ? cellUrl(row.getCell(col.genericUrl)) : undefined);
        if (!companyName || !categoryName || !categoryUrl) continue;

        const sourceRow: Record<string, unknown> = {};
        headerRow.eachCell((cell, c) => {
          sourceRow[headers[c] ?? `col${c}`] = row.getCell(c).value;
        });

        seeds.push({
          companyName,
          website: col.website != null ? (cellText(row.getCell(col.website)) ?? undefined) : undefined,
          competitorType: col.type != null ? (cellText(row.getCell(col.type)) ?? undefined) : undefined,
          productLine:
            col.productLine != null ? (cellText(row.getCell(col.productLine)) ?? undefined) : undefined,
          categoryName,
          categoryUrl,
          sourceRow,
        });
      }
    }
  }

  // 目录不存在时自动创建（幂等），避免 writeFileSync 报 ENOENT
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(seeds, null, 2), 'utf-8');
  return outFile;
}
