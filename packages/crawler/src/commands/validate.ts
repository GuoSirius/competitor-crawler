// `pnpm validate` 与 `pnpm field-docs` 命令实现。
//
// validate：对全部（或 --site 指定）站点配置跑 validateSiteConfig，打印问题；
//   存在 error 级问题时返回非 0（供 CI 门禁）。不修改任何文件、不阻断。
// field-docs：打印内建字段字典（哪些字段该配、类型/阶段/是否必填/是否身份键）。

import { listSiteConfigs, loadSiteConfig, resolveSections } from '../config/loader.js';
import { validateSiteConfig, formatIssues, hasErrors } from '../config/validate.js';
import {
  PRODUCT_FIELDS,
  CONTENT_FIELDS,
  dbColumnOf,
  type FieldMeta,
} from '@competitor-crawler/shared';
import type { SectionConfig, SiteConfig } from '../config/types.js';

export interface ValidateOpts {
  /** 站点域名；省略则校验 config/sites 下全部站点（与 crawl 的 --domain 同义，旧名 --site 已由 CLI 别名归一） */
  domain?: string;
}

/** 返回 error 级问题数（>0 即 CI 应失败） */
export function runValidate(opts: ValidateOpts = {}): number {
  const domains = opts.domain ? [opts.domain] : listSiteConfigs();
  if (domains.length === 0) {
    console.log('没有可校验的站点配置（config/sites 为空，或 --domain 指定的站点不存在）');
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

function printTable(title: string, fields: FieldMeta[], kind: 'products' | 'contents' = 'products'): void {
  console.log(`\n${title}`);
  const cols = ['字段', '落库列', '类型', '阶段', '必填', '身份键', '列表兜底', '不一致审计', '说明'];
  const rows = fields.map((f) => [
    f.name,
    dbColumnOf(f.name, kind) ?? 'row（兜底）',
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

/** YAML 某栏目实际声明的字段名（parseList / parseDetail 两处合并，标注声明位置） */
function declaredFields(s: SectionConfig): Array<{ name: string; stage: '列表' | '详情' }> {
  const out: Array<{ name: string; stage: '列表' | '详情' }> = [];
  for (const [name, spec] of Object.entries(s.parseList?.fields ?? {})) {
    if (!spec) continue; // YAML 里写成 `field:` 空值 → 未声明
    out.push({ name, stage: '列表' });
  }
  for (const [name, spec] of Object.entries(s.parseDetail?.fields ?? {})) {
    if (!spec) continue;
    out.push({ name, stage: '详情' });
  }
  return out;
}

/** 打印某站点「YAML 已配字段 → 落库列」对照 + 还没配的字段（即表里不会有数据的列） */
function printSiteFieldMap(cfg: SiteConfig): void {
  console.log(`\n【${cfg.domain}】YAML 字段 → 落库列（按栏目）`);
  for (const s of resolveSections(cfg)) {
    const declared = declaredFields(s);
    if (declared.length === 0) {
      console.log(`  - ${s.key}：未声明任何 fields`);
      continue;
    }
    console.log(`  - ${s.key}（${s.contentType}）`);
    for (const d of declared) {
      const col = dbColumnOf(d.name, s.contentType === 'products' ? 'products' : 'contents');
      const to = col === null ? 'row（兜底列）' : col;
      console.log(`      ${d.name.padEnd(14)} → ${to}  [${d.stage}阶段]`);
    }
    // 还没配、但表里能存的字段（提醒：想让某列有数据就得配它）
    const has = new Set(declared.map((d) => d.name));
    if (s.contentType !== 'products') {
      const missing = CONTENT_FIELDS.filter(
        (f) =>
          f.stage !== 'site' &&
          !f.required &&
          !has.has(f.name) &&
          f.name !== 'detailUrl' &&
          !(f.name === 'name' && has.has('title')),
      ).map((f) => `${f.name}（→ ${dbColumnOf(f.name, 'contents') ?? 'row'}）`);
      if (missing.length) console.log(`      未配（该列暂无数据）：${missing.join('、')}`);
    }
  }
}

/** 打印内建字段参考表（用户不知道该配哪些字段时的字典）；带 domain 时额外打站点字段对照 */
export function runFieldDocs(opts: { domain?: string } = {}): void {
  console.log('竞品爬虫内建字段字典');
  console.log('说明：YAML 的 parseList.fields / parseDetail.fields 里，key 必须是下表中的「字段」；');
  console.log('      不在表中的名字视为「站点特有字段」，会进 row 兜底列（不参与去重/比价）。');
  console.log('      阶段 list=仅列表抽取 / detail=仅详情抽取 / both=两阶段均可；site=站点级顶层配置。');
  printTable('【products 表】', PRODUCT_FIELDS, 'products');
  printTable('【contents 表】（contentType != products 的栏目）', CONTENT_FIELDS, 'contents');
  if (opts.domain) {
    try {
      printSiteFieldMap(loadSiteConfig(opts.domain));
    } catch (e) {
      console.log(`\n⚠ ${opts.domain}：无法读取站点配置 —— ${(e as Error).message}`);
    }
  }
  console.log('\n提示：`pnpm field-docs --domain <站点>` 可看该站点「YAML 字段 → 落库列」对照；');
  console.log('      `pnpm validate` 检测现有 YAML 是否配错字段名。');
}
