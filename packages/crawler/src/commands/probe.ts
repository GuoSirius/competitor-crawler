import { like } from 'drizzle-orm';
import { absoluteUrl, categories, createDb } from '@competitor-crawler/shared';
import { resolveSections, loadSiteConfig } from '../config/loader.js';
import { fetchPage, type RenderMode } from '../fetch/page.js';
import { parseListWithConfig, parseDetailWithConfig } from '../adapter/yamlAdapter.js';
import { detectSpecPriceShape } from '../adapter/shapeDetect.js';
import { applyApiSources } from '../adapter/apiSource.js';
import { applyModelFallback, isModelFallbackEnabled } from '../llm/fallbackAdapter.js';
import { recordAlert } from '../util/alerts.js';
import { Progress } from '../util/progress.js';

export interface ProbeOpts {
  domain: string;
  listUrl?: string;
  render?: string;
  sample?: number;
  /** 只验证指定栏目（多规则站点）；省略则遍历全部 section */
  section?: string;
  /** 每个栏目抽查几个详情页做「形态探测」；默认 1，传 0 关闭 */
  detail?: number;
}

/**
 * 单站验证探针：加载该站点的 YAML 适配器，抓取列表页并跑解析，
 * 打印抽取条数与前 N 条样本，便于分析 YAML / 适配器逻辑是否正确。
 *
 * 多规则站点（sections）会逐栏目验证：每个 section 用各自的 startUrls + parseList，
 * 并给条目打上 sectionKey，模拟详情阶段的规则选型与去重口径 B。
 *
 * 另外会**抽查详情页做「规格×价格形态探测」**（docs/05 §5.3.4）：
 * 若判定为「异步接口」形态（无法静态抽取），会打印「在哪配、怎么配」并落一条
 * `NEEDS_API_HINT` 告警，等人工把接口地址回填到 `parseDetail.api` 后重跑即可。
 *
 * 确认正常后再做大批量 crawl（见用户需求：先验证再采集）。
 */
export async function probe(opts: ProbeOpts): Promise<void> {
  const progress = new Progress();
  const cfg = loadSiteConfig(opts.domain);
  let sections = resolveSections(cfg);

  if (opts.section) {
    const wanted = opts.section;
    sections = sections.filter((s) => s.key === wanted);
    if (sections.length === 0) {
      const all = resolveSections(cfg).map((s) => s.key).join(', ');
      throw new Error(`未找到 section="${wanted}"（该站可用栏目：${all}）`);
    }
  }

  const sample = opts.sample ?? 5;
  const detailCount = opts.detail ?? 1;
  const { db } = createDb();
  const companyId = await findCompanyId(db, opts.domain);

  let grandTotal = 0;
  let anyMissingDetail = false;
  const findings: Array<{ sectionKey: string; shape: string; needsApi: boolean }> = [];

  for (const section of sections) {
    const listUrls = opts.listUrl ? [opts.listUrl] : section.startUrls;
    if (listUrls.length === 0) {
      console.log(`\n⚠️ [section=${section.key}] 无列表页 URL（startUrls 为空且未传 --list-url），跳过。`);
      continue;
    }
    const mode: RenderMode = (opts.render as RenderMode) ?? (section.listTraversal.fallbackToUi ? 'auto' : 'ssr');

    let sectionTotal = 0;
    const sectionItems: Array<{ detailUrl: string; name?: string; sectionKey?: string }> = [];
    for (const listUrl of listUrls) {
      progress.update(`[probe] ${opts.domain} [section=${section.key}] 抓取列表页 ${listUrl}`);
      const html = await fetchPage(listUrl, mode, progress);
      progress.update(`[probe] ${opts.domain} [section=${section.key}] 解析列表页…`);
      const items = parseListWithConfig(html, section.parseList, section.key);

      sectionTotal += items.length;
      grandTotal += items.length;
      // 列表抽到的 detailUrl 可能是相对地址，先按来源列表页绝对化（与 crawl 一致），
      // 否则下方详情页探测直接 fetch 相对地址会报 "Failed to parse URL"。
      for (const it of items) {
        sectionItems.push({
          detailUrl: it.detailUrl ? absoluteUrl(it.detailUrl, listUrl) : it.detailUrl,
          name: it.name,
          sectionKey: it.sectionKey,
        });
      }
      if (items.some((i) => !i.detailUrl)) anyMissingDetail = true;

      console.log(`\n[section=${section.key}] ${listUrl}`);
      console.log(`  解析出 ${items.length} 条；样本（前 ${Math.min(sample, items.length)} 条）：`);
      for (const it of items.slice(0, sample)) {
        console.log(`    • [${it.sectionKey}] ${it.name ?? '(无名称)'}  →  ${it.detailUrl || '(无详情链接)'}`);
      }
    }
    if (sectionTotal === 0) {
      console.log(`\n⚠️ [section=${section.key}] 未解析到任何条目：检查该 section 的 parseList.itemSelector 与 fields 选择器。`);
      continue;
    }

    // ---------- 详情页抽查：形态探测 + 接口实测 ----------
    if (detailCount > 0) {
      const targets = sectionItems.filter((i) => i.detailUrl).slice(0, detailCount);
      for (const it of targets) {
        console.log(`\n[section=${section.key}] 详情页探测：${it.detailUrl}`);
        try {
          const html = await fetchPage(it.detailUrl, mode, progress);
          const np = parseDetailWithConfig(html, section.parseDetail.fields);
          printProductSample(it.name, np);

          // 已配置接口 → 实测（这才是「配好了没」的判据）
          const hasApi = Boolean(section.parseDetail.api?.length);
          if (hasApi) {
            const results = await applyApiSources(np, it.detailUrl, section.parseDetail.api!);
            for (const r of results) {
              console.log(
                r.ok
                  ? `  ✅ api 源 "${r.target}" 通：取到 ${r.count === 1 ? '1 项' : `${r.count} 条`} → ${r.url}`
                  : `  ❌ api 源 "${r.target}" 失败：${r.error}`,
              );
              if (r.ok && Array.isArray(r.picked) && r.picked.length > 0) {
                console.log(`     样本：${JSON.stringify(r.picked[0])}`);
              }
            }
          }

          // 形态 E：模型兜底（仅显式启用时；在「静态选择器 → 异步接口」之后，只补空）
          if (isModelFallbackEnabled(section.parseDetail.modelFallback)) {
            console.log(`  模型兜底：调用模型抽取（MODEL_MODE=${process.env.MODEL_MODE ?? '(未设，默认 hybrid)'}）…`);
            const outcome = await applyModelFallback(
              np,
              html,
              { detailUrl: it.detailUrl, name: it.name },
              section.parseDetail.modelFallback,
            );
            if (outcome?.ok) {
              console.log(
                `  ✅ 补全 ${outcome.filled.length} 项（${outcome.filled.join('、') || '无'}），attempts=${outcome.attempts}，confidence=${outcome.confidence ?? 'n/a'}`,
              );
              if (outcome.notes) console.log(`     模型说明：${outcome.notes}`);
              printProductSample(it.name, np);
            } else {
              console.log(`  ❌ 模型兜底失败（attempts=${outcome?.attempts ?? 0}）：${outcome?.error}`);
            }
          }

          if (hasApi) continue; // 已配接口就不再提示形态

          const f = detectSpecPriceShape(html);
          findings.push({ sectionKey: section.key, shape: f.shape, needsApi: f.needsApi });
          console.log(`  形态判定：${f.shape} — ${f.title}`);
          for (const e of f.evidence) console.log(`    · 证据：${e}`);

          // 多 Tab 维度（与形态正交）：决定「要不要点击」，见 docs/05 §5.3.5
          if (f.tabs?.detected) {
            const kindText =
              f.tabs.kind === 'static'
                ? '内容已随 HTML 下发 → 不需要点击，直接写选择器'
                : f.tabs.kind === 'lazy'
                  ? '点击后才加载 → 需要登记接口或启用模型兜底'
                  : '未定位到面板容器 → 请人工确认内容是否在 HTML 中';
            console.log(
              `  多 Tab：${f.tabs.matches.join('、')}；面板 ${f.tabs.panelCount} 个（非激活 ${f.tabs.hiddenPanelCount} 个，其中有内容 ${f.tabs.hiddenFilledCount} 个）`,
            );
            console.log(`    → ${kindText}`);
          }

          if (f.needsApi) {
            console.log('\n  🔔 该形态无法静态抽取，需要你提供接口地址：');
            console.log(indent(f.howTo, 4));
            const created = await recordAlert(db, {
              type: 'NEEDS_API_HINT',
              severity: 'warning',
              companyId,
              message: `[${opts.domain}] [${section.key}] 规格/价格需异步接口（形态 ${f.shape}）`,
              payload: {
                domain: opts.domain,
                sectionKey: section.key,
                sampleUrl: it.detailUrl,
                shape: f.shape,
                evidence: f.evidence,
                /** 配置位置：config/sites/<domain>.yaml 的 parseDetail.api */
                configFile: `config/sites/${opts.domain}.yaml`,
                configPath: 'parseDetail.api',
                howTo: f.howTo,
              },
            });
            console.log(
              created
                ? '  → 已写入 alerts 表（type=NEEDS_API_HINT, severity=warning）'
                : '  → 同类告警已存在（未重复写入）',
            );
          } else if (f.howTo) {
            console.log('\n  ℹ️ 静态可抽，按下面方式写配置：');
            console.log(indent(f.howTo, 4));
          }
        } catch (e) {
          console.log(`  ⚠️ 详情页探测失败（跳过）：${(e as Error).message}`);
        }
      }
    }
  }

  progress.done(`[probe] 完成：共 ${sections.length} 个栏目，解析出 ${grandTotal} 条产品`);
  if (grandTotal === 0) {
    console.log('\n⚠️ 全部栏目均未解析到条目：请检查 itemSelector 与 fields 选择器是否匹配页面结构。');
  } else if (anyMissingDetail) {
    console.log('\n⚠️ 部分条目缺少 detailUrl：检查 parseList.fields.detailUrl 的 sel/attr 是否取到链接。');
  }

  const needApi = findings.filter((f) => f.needsApi);
  if (needApi.length > 0) {
    console.log(
      `\n🔔 汇总：${needApi.length} 个栏目需要人工提供接口（${needApi.map((f) => `${f.sectionKey}:${f.shape}`).join('、')}）。` +
        `\n   位置：config/sites/${opts.domain}.yaml 的 parseDetail.api；填好后重跑 pnpm probe --domain ${opts.domain} 验证。`,
    );
  }
}

/** 打印详情页抽取出的关键字段（确认选择器是否正确） */
function printProductSample(listName: string | undefined, np: ReturnType<typeof parseDetailWithConfig>): void {
  const brief = (v: unknown) => (v == null || v === '' ? '(空)' : String(v).slice(0, 40));
  console.log('  详情字段：');
  console.log(`    name=${brief(np.name)} | sku=${brief(np.sku)} | sourceProductId=${brief(np.sourceProductId)}`);
  console.log(`    price=${brief(np.price)} ${brief(np.currency)} | priceText=${brief(np.priceText)} | specText=${brief(np.specText)}`);
  console.log(`    specs=${np.specs.length} 项 | introMedia=${np.introMedia.length} 项 | row 键=${Object.keys(np.row).length} 个`);
  if (listName && !np.name) console.log('    ⚠️ 详情未取到 name（将回退用列表名）');
}

/** 按域名找归属公司（用于告警关联）；找不到返回 null */
async function findCompanyId(db: ReturnType<typeof createDb>['db'], domain: string): Promise<number | null> {
  const rows = await db
    .select({ companyId: categories.companyId })
    .from(categories)
    .where(like(categories.url, `%${domain}%`))
    .limit(1);
  return rows[0]?.companyId ?? null;
}

/** 给多行文本加缩进 */
function indent(text: string, n: number): string {
  const pad = ' '.repeat(n);
  return text
    .split('\n')
    .map((l) => (l ? pad + l : l))
    .join('\n');
}
