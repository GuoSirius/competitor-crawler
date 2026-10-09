/**
 * 代码适配器动态加载器（docs/16 🔴-2）：
 * 按域名加载 `adapters/<domain>.ts` 的默认导出并缓存。
 *
 * 加载方式：**显式注册表**。为何不用 `import(\`../adapters/${domain}.js\`)` 变量动态导入——
 *   Node/tsx 原生支持，但 vitest（vite 静态分析）报 "Unknown variable dynamic import"；
 *   而 `import.meta.glob` 又只有 vite 系运行时支持（tsx 不认）。注册表是三者（tsc/tsx/vitest）
 *   都兼容、且类型可查的唯一写法。**新增适配器时必须在此登记**（一致性测试会兜底拦截）。
 *
 * - 未登记 / 加载失败 / 导出没有任何钩子 → 返回 null（按「无适配器」继续，纯 YAML 行为零回归）；
 * - 加载失败只告警不抛错：适配器是加性增强，不是单点（与模型兜底同一容错哲学）。
 */
import { hasCodeAdapter } from '../config/loader.js';
import type { CodeAdapter } from '../adapters/types.js';

/**
 * 域名 → 模块加载器注册表。
 * key 必须与 `config/sites/<domain>.yaml` 及 `adapters/<domain>.ts` 同名。
 */
const registry: Record<string, () => Promise<unknown>> = {
  _example: () => import('../adapters/_example.js'),
  'www.promocell.com': () => import('../adapters/www.promocell.com.js'),
  'www.dojindo.cn': () => import('../adapters/www.dojindo.cn.js'),
};

/** 供一致性测试枚举（新增适配器忘了登记时由测试拦截） */
export function registeredAdapterDomains(): string[] {
  return Object.keys(registry).sort();
}

const cache = new Map<string, CodeAdapter | null>();

const HOOKS = ['preflight', 'buildPageUrl', 'postParseList', 'postParseDetail'] as const;

/** 对象上是否至少实现了一个钩子（防止把空对象/意外导出当适配器） */
function hasAnyHook(a: unknown): boolean {
  if (typeof a !== 'object' || a === null) return false;
  return HOOKS.some((h) => typeof (a as Record<string, unknown>)[h] === 'function');
}

/**
 * 加载某站点的代码适配器；结果按域名缓存（一轮爬取内只 import 一次）。
 * 返回 null 表示该站点走纯 YAML。
 */
export async function loadCodeAdapter(domain: string): Promise<CodeAdapter | null> {
  const hit = cache.get(domain);
  if (hit !== undefined) return hit;

  let adapter: CodeAdapter | null = null;
  if (hasCodeAdapter(domain)) {
    const load = registry[domain];
    if (!load) {
      console.warn(
        `[adapter] ${domain} 适配器文件存在但未在 adapterLoader.ts 注册表登记，` +
          `不会生效（请在其 registry 中补一行）。按无适配器继续。`,
      );
    } else {
      try {
        const mod = (await load()) as { default?: CodeAdapter };
        if (mod.default && hasAnyHook(mod.default)) {
          adapter = mod.default;
        } else {
          console.warn(`[adapter] ${domain} 适配器未提供默认导出（或未实现任何钩子），按无适配器继续`);
        }
      } catch (e) {
        console.warn(`[adapter] 加载 ${domain} 代码适配器失败（按无适配器继续）：${(e as Error).message}`);
      }
    }
  }
  cache.set(domain, adapter);
  return adapter;
}
