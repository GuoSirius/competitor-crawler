// 站点配置字段校验（Q1）：在正式跑之前或 probe/crawl 加载配置后调用。
//
// 设计原则（用户明确要求）：
//   - 检测 + 通知，但**绝不阻断**。返回 ConfigIssue[]，调用方自行决定打印/退出码。
//   - 不误报：未知字段默认视为「合法站点特有字段」（进 row 兜底），只有「疑似拼写错误」
//     （与某内建字段极近）才 WARN；其余静默放行。
//   - 缺必填 / 缺身份键给 error 级，但同样只进 issue 列表，不抛异常、不中断爬取。
//     `pnpm validate` 命令对 error 级返回非 0 退出码，供 CI 门禁使用。

import type { FieldSpec } from '@competitor-crawler/shared';
import {
  fieldsForKind,
  getFieldMeta,
  BUILTIN_FIELD_NAMES,
  suggestFieldName,
  type ContentKind,
} from '@competitor-crawler/shared';
import type { SiteConfig } from './types.js';
import { isRenderMode, RENDER_MODES } from './types.js';

export type IssueLevel = 'error' | 'warn' | 'info';
export type IssueCode =
  | 'MISSING_REQUIRED'
  | 'MISSING_IDENTITY'
  | 'UNKNOWN_FIELD_TYPO'
  | 'STAGE_MISMATCH'
  | 'NUMERIC_NOT_NUMBER'
  | 'HASH_PAGINATION_UNSUPPORTED'
  | 'INVALID_RENDER_MODE';

export interface ConfigIssue {
  level: IssueLevel;
  code: IssueCode;
  /** 面向用户的说明 */
  message: string;
  /** 出问题的字段名（若有） */
  field?: string;
  /** 出问题的栏目 key（多规则站点；单规则为 'default'） */
  sectionKey?: string;
}

interface SectionLike {
  key: string;
  contentType?: string;
  parseList?: { fields?: Record<string, FieldSpec> };
  parseDetail?: { fields?: Record<string, FieldSpec> };
  listTraversal?: { strategy?: string; urlTemplate?: string };
}

function toSections(cfg: SiteConfig): SectionLike[] {
  if (cfg.sections && cfg.sections.length > 0) {
    // 与 resolveSections 的继承规则一致：section 未写 parseList/parseDetail 时回退顶层默认，
    // 否则会对「顶层公共规则 + section 只写 startUrls」的站点全面误报。
    return cfg.sections.map((s) => ({
      key: s.key || 'default',
      contentType: s.contentType ?? s.collects,
      parseList: s.parseList ?? cfg.parseList,
      parseDetail: s.parseDetail ?? cfg.parseDetail,
      listTraversal: s.listTraversal ?? cfg.listTraversal,
    }));
  }
  return [
    {
      key: 'default',
      contentType: cfg.contentType ?? cfg.collects,
      parseList: cfg.parseList,
      parseDetail: cfg.parseDetail,
      listTraversal: cfg.listTraversal,
    },
  ];
}

/**
 * 校验单个站点配置，返回全部问题（按严重度 error > warn > info 排序）。
 * 零副作用、不抛异常 —— 即使配置严重错误也返回 issue 列表让调用方处理。
 */
export function validateSiteConfig(cfg: SiteConfig): ConfigIssue[] {
  const issues: ConfigIssue[] = [];
  const sections = toSections(cfg);

  // 0) 渲染模式取值：非法值会静默退化成 auto（难排查），故显式报错。
  //    旧名 spa（2026-10-05 更名 browser）单独给一句人话提示，别让人以为是拼写错误。
  const renderPairs: Array<[string, unknown]> = [
    ['render', cfg.render],
    ['renderList', cfg.renderList],
    ['renderDetail', cfg.renderDetail],
  ];
  for (const s of cfg.sections ?? []) {
    const at = `sections[${s.key || '(未命名)'}]`;
    renderPairs.push([`${at}.render`, s.render], [`${at}.renderList`, s.renderList], [`${at}.renderDetail`, s.renderDetail]);
  }
  for (const [label, v] of renderPairs) {
    if (v === undefined) continue;
    if (isRenderMode(v)) continue;
    const legacy = v === 'spa' ? '（旧名 spa 已于 2026-10-05 更名为 browser，请直接改）' : '';
    issues.push({
      level: 'error',
      code: 'INVALID_RENDER_MODE',
      message: `${label} 的取值 '${String(v)}' 不是合法渲染模式（可选：${RENDER_MODES.join(' / ')}）${legacy}——非法值会静默退化成 auto。`,
      field: label,
    });
  }

  for (const sec of sections) {
    // 配置桩（只有 domain/company 等身份信息，还没写 parseList）：字段无从校验，
    // 给一条 info 引导先跑 gen-site，而不是报「缺 name/身份键」吓人（与 probe 的桩判定一致；
    // resolveSections 本身会在爬取时对桩抛错，这里不必重复当 error）。
    if (!sec.parseList) {
      issues.push({
        level: 'info',
        code: 'STAGE_MISMATCH',
        message: `栏目 [${sec.key}] 的 parseList 未配置（配置桩/未完成）——字段校验跳过。可先运行 pnpm gen-site --domain ${cfg.domain} 生成规则后再校验。`,
        sectionKey: sec.key,
      });
      continue;
    }

    const kind: ContentKind = sec.contentType && sec.contentType !== 'products' ? 'contents' : 'products';
    const registry = fieldsForKind(kind);
    const detailFields = sec.parseDetail?.fields ?? {};
    const listFields = sec.parseList?.fields ?? {};
    const allKeys = new Set([...Object.keys(detailFields), ...Object.keys(listFields)]);

    // 1) 必填字段缺失
    for (const f of registry) {
      if (!f.required) continue;
      // contents 管线特判：标题来源链是 np.name → row.title → 列表名（toPendingContent.pick），
      // YAML 配 'name' 即等价于 'title'（name 会提升到 NormalizedProduct.name），不算缺失。
      const satisfied = allKeys.has(f.name) || (kind === 'contents' && f.name === 'title' && allKeys.has('name'));
      if (!satisfied) {
        issues.push({
          level: 'error',
          code: 'MISSING_REQUIRED',
          message: `栏目 [${sec.key}] 缺少必填字段 '${f.name}'（${f.desc}）—— 该字段无处抽取，落库后将为空。`,
          field: f.name,
          sectionKey: sec.key,
        });
      }
    }

    // 2) 身份键缺失（products：detailUrl 列表抽出 或 sourceProductId 详情抽出，二选一即可）
    if (kind === 'products') {
      const hasDetailUrl = 'detailUrl' in listFields;
      const hasSourceId = 'sourceProductId' in detailFields;
      if (!hasDetailUrl && !hasSourceId) {
        issues.push({
          level: 'error',
          code: 'MISSING_IDENTITY',
          message: `栏目 [${sec.key}] 缺身份键：既未在 parseList.fields 配 'detailUrl'，也未在 parseDetail.fields 配 'sourceProductId'。去重/软删将无依据，产品会重复落库或无法复活。`,
          sectionKey: sec.key,
        });
      }
    }

    // 2b) hash 翻页防御：HTTP 不发送 # 之后的部分，逐页 fetch 永远拿第一页 → 静默重复/0 条
    const tv = sec.listTraversal;
    if (tv?.strategy === 'pagination-url' && tv.urlTemplate?.includes('#')) {
      issues.push({
        level: 'error',
        code: 'HASH_PAGINATION_UNSUPPORTED',
        message: `栏目 [${sec.key}] 的 urlTemplate 含 '#'（如 #page={page}）——hash 翻页不被支持：HTTP 请求不发送 fragment，逐页抓取拿到的永远是第一页。hash 路由站点请改用 render browser + pagination-html（UI 点击翻页），或改用等效的 ?query 翻页参数。`,
        sectionKey: sec.key,
      });
    }

    // 3) 逐字段检查
    for (const key of allKeys) {
      const meta = getFieldMeta(key, kind);

      // 站点级字段被误放进解析 fields
      if (meta && meta.stage === 'site') {
        issues.push({
          level: 'info',
          code: 'STAGE_MISMATCH',
          message: `字段 '${key}' 是站点级配置（应在 YAML 顶层写，而非 parseDetail/parseList.fields 内），放进 fields 不会生效，会被忽略。`,
          field: key,
          sectionKey: sec.key,
        });
        continue;
      }

      if (meta) {
        // 已知内建字段
        // 3a) 数值字段未标 number:true → 解析成字符串，排序/比价失真
        if (meta.type === 'number') {
          const spec = detailFields[key] ?? listFields[key];
          if (spec && spec.number !== true) {
            issues.push({
              level: 'info',
              code: 'NUMERIC_NOT_NUMBER',
              message: `字段 '${key}' 是数值类型，但 YAML 未写 number: true —— 将被当成字符串抽取，价格排序/涨跌会失真。建议加 number: true。`,
              field: key,
              sectionKey: sec.key,
            });
          }
        }
        // 3b) 仅声明在列表阶段、却是详情专属（且不参与合并）→ 列表值不会进 typed 列
        if (listFields[key] !== undefined && meta.stage === 'detail' && meta.listFallback !== true) {
          issues.push({
            level: 'info',
            code: 'STAGE_MISMATCH',
            message: `字段 '${key}' 仅声明在 parseList.fields，但它是详情阶段字段（不会经「列表兜底」合并），列表抽到的内容只会留在 row 兜底列，不会进入 products.${key}。若需该字段，请在 parseDetail.fields 也声明。`,
            field: key,
            sectionKey: sec.key,
          });
        }
        continue;
      }

      // 4) 未知字段：像内建拼写错误才提示，否则视为合法站点特有字段（进 row）
      const suggested = suggestFieldName(key, kind);
      if (suggested) {
        issues.push({
          level: 'warn',
          code: 'UNKNOWN_FIELD_TYPO',
          message: `字段 '${key}' 不在内建字段表中，且拼写极接近 '${suggested}'。若本意是 '${suggested}' 请改名；否则它会被当作站点特有字段存入 row（不参与去重/比价）。`,
          field: key,
          sectionKey: sec.key,
        });
      }
      // 无建议 → 合法自定义字段，静默放行（不误报）
    }
  }

  const order: Record<IssueLevel, number> = { error: 0, warn: 1, info: 2 };
  issues.sort((a, b) => order[a.level] - order[b.level]);
  return issues;
}

/** 是否已存在 error 级问题（供 CLI 决定退出码） */
export function hasErrors(issues: ConfigIssue[]): boolean {
  return issues.some((i) => i.level === 'error');
}

/** 把 issues 格式化为可打印行（带级别前缀与栏目信息） */
export function formatIssues(domain: string, issues: ConfigIssue[]): string[] {
  if (issues.length === 0) return [];
  const lines: string[] = [`站点 ${domain}（${issues.length} 条）：`];
  for (const i of issues) {
    const tag = i.level === 'error' ? '❌' : i.level === 'warn' ? '⚠️ ' : 'ℹ️ ';
    lines.push(`  ${tag} [${i.code}] ${i.message}`);
  }
  return lines;
}
