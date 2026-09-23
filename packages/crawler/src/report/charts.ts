import { toNumber } from '@competitor-crawler/shared';
import { UNCATEGORIZED, type ReportRow } from './summary.js';

/**
 * 图表数据构建（docs/08 §8.4）。
 *
 * 全部是**纯函数**：输入 ReportRow 数组，输出 ECharts option 形状的普通对象，
 * 不碰 DB / 文件系统 / 网络，方便单测。
 *
 * ⚠️ 刻意**不消费 `price_history`**：该表目前只写不读，消费端（价格走势 / 涨跌告警）
 * 由用户明确「后期再看应用」，勿擅自接入。故价格相关图表一律基于**当前快照**
 * （products.specs / products.price），而非历史序列。
 */

export interface ChartSpec {
  id: string;
  title: string;
  subtitle?: string;
  option: Record<string, unknown>;
}

const byZh = (a: string, b: string): number => a.localeCompare(b, 'zh');

// 与 light 主题协调的调色板
const PALETTE = [
  '#2f5597',
  '#c00000',
  '#0e7c66',
  '#bf8f00',
  '#5b2c6f',
  '#1f6feb',
  '#a0522d',
  '#00838f',
];

// ------------------------------------------------------------ 1) 公司产品总数

export function buildCompanyTotals(rows: readonly ReportRow[]): { names: string[]; counts: number[] } {
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.company, (map.get(r.company) ?? 0) + 1);
  const entries = [...map.entries()].sort((a, b) => b[1] - a[1] || byZh(a[0], b[0]));
  return { names: entries.map(([n]) => n), counts: entries.map(([, c]) => c) };
}

// ------------------------------------------------------ 2) 公司 × 品类（堆叠）

export function buildCompanyCategoryStack(rows: readonly ReportRow[]): {
  companies: string[];
  categories: string[];
  series: Array<{ name: string; data: number[] }>;
} {
  const companies = [...new Set(rows.map((r) => r.company))].sort(byZh);
  const categories = [...new Set(rows.map((r) => r.category ?? UNCATEGORIZED))].sort(byZh);
  const ci = new Map(companies.map((c, i) => [c, i]));
  const gi = new Map(categories.map((c, j) => [c, j]));
  const grid = categories.map(() => companies.map(() => 0));
  for (const r of rows) {
    const i = ci.get(r.company);
    const j = gi.get(r.category ?? UNCATEGORIZED);
    if (i === undefined || j === undefined) continue;
    grid[j][i] += 1;
  }
  return {
    companies,
    categories,
    series: categories.map((name, j) => ({ name, data: grid[j] })),
  };
}

// -------------------------------------------------------- 3) 品类占比（饼图）

export function buildCategoryShare(rows: readonly ReportRow[]): Array<{ name: string; value: number }> {
  const map = new Map<string, number>();
  for (const r of rows) {
    const k = r.category ?? UNCATEGORIZED;
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value || byZh(a.name, b.name));
}

// ---------------------------------------------------- 4) 价格分布（直方图分桶）

/** 分桶上界（元）；最后一桶为「≥ 上界最大值」 */
export const PRICE_BUCKETS = [100, 500, 1000, 3000, 5000, 10000] as const;

/** 取用于价格分布的价格序列：优先 specs 的现价，无 specs 时退化用产品级 price */
export function priceValues(rows: readonly ReportRow[]): number[] {
  const out: number[] = [];
  for (const r of rows) {
    const specs = Array.isArray(r.specs) ? r.specs : [];
    let fromSpecs = false;
    for (const s of specs) {
      const raw = s.priceNow;
      const n = typeof raw === 'string' ? toNumber(raw) : null;
      if (n !== null) {
        out.push(n);
        fromSpecs = true;
      }
    }
    if (!fromSpecs && typeof r.price === 'number') out.push(r.price);
  }
  return out;
}

export function priceBucketLabel(index: number): string {
  const upper = PRICE_BUCKETS[index];
  const lower = index === 0 ? 0 : PRICE_BUCKETS[index - 1];
  return upper === undefined ? `≥ ${lower}` : `${lower}–${upper}`;
}

export function buildPriceHistogram(rows: readonly ReportRow[]): {
  labels: string[];
  counts: number[];
  total: number;
} {
  const values = priceValues(rows);
  const labels = [
    ...PRICE_BUCKETS.map((_, i) => priceBucketLabel(i)),
    priceBucketLabel(PRICE_BUCKETS.length), // 最后一桶：超出最大上界
  ];
  const counts = labels.map(() => 0);
  for (const v of values) {
    let idx = PRICE_BUCKETS.findIndex((upper) => v <= upper);
    if (idx === -1) idx = PRICE_BUCKETS.length; // 超出最大分桶
    counts[idx] += 1;
  }
  return { labels, counts, total: values.length };
}

// ------------------------------------------------ 5) 克隆号覆盖（公司 × 有/无）

export function buildCloneCoverage(rows: readonly ReportRow[]): {
  companies: string[];
  withClone: number[];
  withoutClone: number[];
} {
  const map = new Map<string, { withClone: number; withoutClone: number }>();
  for (const r of rows) {
    const e = map.get(r.company) ?? { withClone: 0, withoutClone: 0 };
    if (typeof r.cloneNumber === 'string' && r.cloneNumber.trim() !== '') e.withClone += 1;
    else e.withoutClone += 1;
    map.set(r.company, e);
  }
  const companies = [...map.keys()].sort(byZh);
  return {
    companies,
    withClone: companies.map((c) => map.get(c)!.withClone),
    withoutClone: companies.map((c) => map.get(c)!.withoutClone),
  };
}

// --------------------------------------------- 6) 入库趋势（按季度累计，折线）

/**
 * 按 `firstSeenAt` 归属季度，给出**累计**入库产品数。
 * 注意：这是「产品入库时间」趋势，不是价格走势（价格历史见文件头说明）。
 */
export function buildIntakeTrend(rows: readonly ReportRow[]): {
  quarters: string[];
  cumulative: number[];
} {
  const perQuarter = new Map<string, number>();
  for (const r of rows) {
    if (typeof r.firstSeenAt !== 'number') continue;
    const d = new Date(r.firstSeenAt * 1000);
    const key = `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
    perQuarter.set(key, (perQuarter.get(key) ?? 0) + 1);
  }
  const quarters = [...perQuarter.keys()].sort(quarterKeyCompare);
  let running = 0;
  const cumulative = quarters.map((q) => {
    running += perQuarter.get(q) ?? 0;
    return running;
  });
  return { quarters, cumulative };
}

/** 'YYYY-Qn' 的时序比较 */
function quarterKeyCompare(a: string, b: string): number {
  const [ya, qa] = a.split('-Q').map(Number);
  const [yb, qb] = b.split('-Q').map(Number);
  return ya! - yb! || qa! - qb!;
}

// ------------------------------------------------------------------ 组装

export function buildCharts(rows: readonly ReportRow[]): ChartSpec[] {
  const totals = buildCompanyTotals(rows);
  const stack = buildCompanyCategoryStack(rows);
  const share = buildCategoryShare(rows);
  const hist = buildPriceHistogram(rows);
  const clone = buildCloneCoverage(rows);
  const trend = buildIntakeTrend(rows);

  const specs: ChartSpec[] = [
    {
      id: 'company-total',
      title: '各公司产品总数',
      subtitle: '谁的产品池更大',
      option: {
        color: PALETTE,
        tooltip: { trigger: 'axis' },
        grid: { left: 60, right: 24, top: 40, bottom: 40 },
        xAxis: { type: 'category', data: totals.names, axisLabel: { interval: 0, rotate: 20 } },
        yAxis: { type: 'value' },
        series: [{ type: 'bar', data: totals.counts, barMaxWidth: 48, label: { show: true, position: 'top' } }],
      },
    },
    {
      id: 'company-category',
      title: '公司 × 品类 产品数',
      subtitle: '该品类谁家最全',
      option: {
        color: PALETTE,
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        legend: { bottom: 0, type: 'scroll' },
        grid: { left: 60, right: 24, top: 40, bottom: 64 },
        xAxis: { type: 'category', data: stack.companies, axisLabel: { interval: 0, rotate: 20 } },
        yAxis: { type: 'value' },
        series: stack.series.map((s) => ({ name: s.name, type: 'bar', stack: 'total', data: s.data })),
      },
    },
    {
      id: 'category-share',
      title: '品类占比',
      subtitle: '市场集中度',
      option: {
        color: PALETTE,
        tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
        legend: { bottom: 0, type: 'scroll' },
        series: [
          {
            type: 'pie',
            radius: ['38%', '66%'],
            avoidLabelOverlap: true,
            data: share,
            label: { formatter: '{b}\n{c}' },
          },
        ],
      },
    },
    {
      id: 'price-hist',
      title: '价格分布',
      subtitle: `当前快照价格分桶（共 ${hist.total} 个价格点）`,
      option: {
        color: PALETTE,
        tooltip: { trigger: 'axis' },
        grid: { left: 60, right: 24, top: 40, bottom: 48 },
        xAxis: { type: 'category', data: hist.labels, axisLabel: { interval: 0, rotate: 20 } },
        yAxis: { type: 'value', name: '产品数' },
        series: [{ type: 'bar', data: hist.counts, barMaxWidth: 48, label: { show: true, position: 'top' } }],
      },
    },
    {
      id: 'clone-coverage',
      title: '克隆号覆盖（数据完整度）',
      subtitle: '有克隆号 / 无克隆号',
      option: {
        color: ['#0e7c66', '#d9d9d9'],
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        legend: { bottom: 0 },
        grid: { left: 60, right: 24, top: 40, bottom: 64 },
        xAxis: { type: 'category', data: clone.companies, axisLabel: { interval: 0, rotate: 20 } },
        yAxis: { type: 'value' },
        series: [
          { name: '有克隆号', type: 'bar', stack: 'c', data: clone.withClone },
          { name: '无克隆号', type: 'bar', stack: 'c', data: clone.withoutClone },
        ],
      },
    },
    {
      id: 'intake-trend',
      title: '产品入库趋势（按季度累计）',
      subtitle: '基于 first_seen_at，非价格走势',
      option: {
        color: PALETTE,
        tooltip: { trigger: 'axis' },
        grid: { left: 60, right: 24, top: 40, bottom: 40 },
        xAxis: { type: 'category', data: trend.quarters, boundaryGap: false },
        yAxis: { type: 'value', name: '累计产品数' },
        series: [{ type: 'line', smooth: true, data: trend.cumulative, areaStyle: { opacity: 0.12 } }],
      },
    },
  ];
  return specs;
}

// ------------------------------------------------------------ HTML 渲染

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 内联 <script> 里的 JSON 必须转义 `<`，否则名字里出现 `</script>` 会提前闭合标签 */
function safeJsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

/**
 * 生成**自包含的静态 HTML**（ECharts 走 CDN），可直接本地打开或嵌入内部 wiki。
 * CDN 不可达时给出明确提示而不是白屏。
 */
export function renderChartsHtml(
  title: string,
  specs: readonly ChartSpec[],
  generatedAt: Date = new Date(),
): string {
  const cards = specs
    .map(
      (s) => `      <section class="card">
        <h2>${escapeHtml(s.title)}</h2>
${s.subtitle ? `        <p class="sub">${escapeHtml(s.subtitle)}</p>\n` : ''}        <div id="${escapeHtml(s.id)}" class="chart"></div>
      </section>`,
    )
    .join('\n');

  const inits = specs.map((s) => `    mount('${s.id}', ${safeJsonForScript(s.option)});`).join('\n');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 28px; background: #f5f6f8; color: #1f2328;
         font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .meta { color: #6b7280; font-size: 13px; margin-bottom: 22px; }
  .grid { display: grid; gap: 20px; grid-template-columns: repeat(auto-fit, minmax(420px, 1fr)); }
  .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 18px 18px 8px;
          box-shadow: 0 1px 2px rgba(16,24,40,.04); }
  .card h2 { font-size: 15px; margin: 0; }
  .card .sub { color: #8b95a1; font-size: 12px; margin: 4px 0 8px; }
  .chart { width: 100%; height: 320px; }
  footer { color: #8b95a1; font-size: 12px; margin-top: 24px; }
</style>
<script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></script>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <div class="meta">生成时间 ${escapeHtml(generatedAt.toLocaleString('zh-CN'))} · 数据源：本地 sqlite 当前快照</div>
  <div class="grid">
${cards}
  </div>
  <footer>competitor-crawler · pnpm report --charts</footer>
  <script>
    function mount(id, option) {
      const el = document.getElementById(id);
      const chart = echarts.init(el);
      chart.setOption(option);
      window.addEventListener('resize', () => chart.resize());
    }
    if (typeof echarts === 'undefined') {
      document.querySelectorAll('.chart').forEach((el) => {
        el.innerHTML = '<p style="color:#c00;padding:12px;font-size:13px">未能加载 ECharts（CDN 不可达）。请联网后刷新，或改用本地 echarts.min.js。</p>';
      });
    } else {
${inits}
    }
  </script>
</body>
</html>
`;
}
