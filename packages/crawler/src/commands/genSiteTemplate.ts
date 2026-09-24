import ExcelJS from 'exceljs';
import fs from 'node:fs';
import path from 'node:path';
import { dataDir } from '@competitor-crawler/shared';

/** 批量生成模板默认落盘位置 */
export const BATCH_TEMPLATE_FILE = path.join(dataDir, 'seeds', 'gen-site-template.xlsx');
/** 批量生成默认读取位置（与模板路径对应，方便"填完即跑"） */
export const BATCH_DEFAULT_FILE = path.join(dataDir, 'seeds', 'gen-site-batch.xlsx');

interface ColSpec {
  key: string;
  header: string;
  width: number;
  /** 是否必填 */
  required: boolean;
  /** 填写说明（写入「填写说明」页） */
  desc: string;
}

const COLUMNS: ColSpec[] = [
  { key: 'domain', header: '域名(domain)', width: 24, required: true, desc: '站点域名，如 www.xpbiomed.com；执行后会生成 config/sites/<domain>.yaml' },
  { key: 'listUrl', header: '列表页URL(listUrl)', width: 46, required: true, desc: '列表页地址（必填）；模型据此抓取列表并生成 parseList' },
  { key: 'detailUrl', header: '详情页URL(detailUrl,可选)', width: 46, required: false, desc: '详情页示例地址（可选）；提供后模型同时参考详情页结构，生成更准' },
  { key: 'companyKey', header: '公司(companyKey,可选)', width: 20, required: false, desc: '归属公司名（可选）；不填则爬取时按域名兜底' },
  { key: 'render', header: '渲染(render,可选:ssr/spa/auto)', width: 24, required: false, desc: '渲染模式：ssr(纯静态) / spa(需浏览器) / auto(自动判断，默认)' },
  { key: 'notes', header: '备注(notes,可选)', width: 34, required: false, desc: '补充说明（可选）；如特殊翻页、需登录等，帮助模型更好生成' },
];

/**
 * 生成「批量站点配置」Excel 模板：
 * - 工作表「站点清单」：表头 + 1 行示例（标灰，正式使用前删除）
 * - 工作表「填写说明」：每列含义 + 使用步骤
 * 之后把真实站点填进「站点清单」，跑 `pnpm gen-site:batch` 即可一次性批量生成。
 */
export async function genSiteTemplate(file?: string): Promise<string> {
  const out = file ?? BATCH_TEMPLATE_FILE;

  const wb = new ExcelJS.Workbook();

  // ---------- 工作表 1：站点清单 ----------
  const ws = wb.addWorksheet('站点清单');
  ws.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { vertical: 'middle', wrapText: true };
  headerRow.height = 30;

  // 示例行（整行标灰，提示"正式使用前删除"）
  const example = ws.addRow({
    domain: 'www.example.com',
    listUrl: 'https://www.example.com/products',
    detailUrl: 'https://www.example.com/products/1',
    companyKey: '示例公司',
    render: 'auto',
    notes: '★ 示例行：正式批量生成前请整行删除',
  });
  example.font = { color: { argb: 'FF999999' }, italic: true };

  // ---------- 工作表 2：填写说明 ----------
  const help = wb.addWorksheet('填写说明');
  help.columns = [
    { header: '列', key: 'col', width: 30 },
    { header: '必填', key: 'req', width: 8 },
    { header: '说明', key: 'desc', width: 80 },
  ];
  help.getRow(1).font = { bold: true };
  for (const c of COLUMNS) {
    help.addRow({ col: c.header, req: c.required ? '是' : '否', desc: c.desc });
  }
  help.addRow({});
  help.addRow({ col: '使用步骤', req: '', desc: '1) 在「站点清单」按列填入真实站点（删除示例行）' });
  help.addRow({ col: '', req: '', desc: '2) 运行 pnpm gen-site:batch  （默认读取 ' + BATCH_DEFAULT_FILE + '）' });
  help.addRow({ col: '', req: '', desc: '3) 可用 pnpm gen-site:batch --file <路径> 指定其它 Excel' });
  help.addRow({ col: '', req: '', desc: '4) 加 --dry-run 仅解析并打印待生成清单，不调用模型' });
  help.addRow({ col: '', req: '', desc: '5) 每个站点生成后产出 config/sites/<domain>.yaml，再 pnpm probe 验证' });

  fs.mkdirSync(path.dirname(out), { recursive: true });
  await wb.xlsx.writeFile(out);
  return out;
}
