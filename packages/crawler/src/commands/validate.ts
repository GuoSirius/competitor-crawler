// `pnpm validate` 与 `pnpm field-docs` 命令实现。
//
// validate：对全部（或 --site 指定）站点配置跑 validateSiteConfig，打印问题；
//   存在 error 级问题时返回非 0（供 CI 门禁）。不修改任何文件、不阻断。
// field-docs：打印内建字段字典（哪些字段该配、类型/阶段/是否必填/是否身份键）。

import { listSiteConfigs, loadSiteConfig } from '../config/loader.js';
import { validateSiteConfig, formatIssues, hasErrors } from '../config/validate.js';
import { PRODUCT_FIELDS, CONTENT_FIELDS, type FieldMeta } from '@competitor-crawler/shared';

export interface ValidateOpts {
  site?: string;
}

/** 返回 error 级问题数（>0 即 CI 应失败） */
export function runValidate(opts: ValidateOpts = {}): number {
  const domains = opts.site ? [opts.site] : listSiteConfigs();
  if (domains.length === 0) {
    console.log('没有可校验的站点配置（config/sites 为空，或 --site 指定的站点不存在）');
    return 0;
  }
  let errorCount = 0;
  let warnCount = 0;
  for (const domain of domains) {
    let cfg;
    try {
      cfg = loadSiteConfig(domain);
    } catch (e) {
      console.log(`\n❌ ${domain}：无法加载配置 —— ${(e as Error).message}`);
      errorCount++;
      continue;
    }
    const issues = validateSiteConfig(cfg);
    if (issues.length === 0) {
      console.log(`✅ ${domain}：字段配置无误`);
      continue;
    }
    errorCount += issues.filter((i) => i.level === 'error').length;
    warnCount += issues.filter((i) => i.level === 'warn').length;
    for (const l of formatIssues(domain, issues)) console.log(l);
  }
  const ok = errorCount === 0;
  console.log(
    `\n[validate] 完成：${domains.length} 个站点，error ${errorCount} / warn ${warnCount}` +
      (ok ? '（无 error，可放心跑）' : '（存在 error，建议修正后再跑批量 crawl）'),
  );
  return errorCount;
}

function printTable(title: string, fields: FieldMeta[]): void {
  console.log(`\n${title}`);
  const cols = ['字段', '类型', '阶段', '必填', '身份键', '列表兜底', '不一致审计', '说明'];
  const rows = fields.map((f) => [
    f.name,
    f.type,
    f.stage,
    f.required ? '是' : '-',
    f.identity ? '是' : '-',
    f.listFallback ? '是' : '-',
    f.auditMismatch ? '是' : '-',
    f.desc,
  ]);
  const widths = cols.map((c, i) => Math.max(c.length, ...rows.map((r) => String(r[i]).length)));
  const fmt = (r: string[]) => r.map((c, i) => String(c).padEnd(widths[i] + 2)).join('').trimEnd();
  console.log(fmt(cols));
  console.log(cols.map((_, i) => '-'.repeat(widths[i] + 2)).join('').trimEnd());
  for (const r of rows) console.log(fmt(r));
}

/** 打印内建字段参考表（用户不知道该配哪些字段时的字典） */
export function runFieldDocs(): void {
  console.log('竞品爬虫内建字段字典');
  console.log('说明：YAML 的 parseList.fields / parseDetail.fields 里，key 必须是下表中的「字段」；');
  console.log('      不在表中的名字视为「站点特有字段」，会进 row 兜底列（不参与去重/比价）。');
  console.log('      阶段 list=仅列表抽取 / detail=仅详情抽取 / both=两阶段均可；site=站点级顶层配置。');
  printTable('【products 表】', PRODUCT_FIELDS);
  printTable('【contents 表】（contentType != products 的栏目）', CONTENT_FIELDS);
  console.log('\n提示：运行 `pnpm validate` 可检测现有 YAML 是否配错字段名。');
}
