import * as cheerio from 'cheerio';
import type { DomRead } from './spec.js';

/** 基于 cheerio 的 DomRead 实现（SSR 静态页解析用）。
 * el 内部用 any 承载 cheerio 节点/节点集合：cheerio 1.x 的 toArray() 返回 AnyNode、root() 返回 Cheerio<Document>，
 * 与 domhandler 的 Element 类型不兼容；此处用 any 封装在 DomRead 接口边界内，对外仍是强类型。 */
export class CheerioDomRead implements DomRead {
  constructor(
    private readonly $: cheerio.CheerioAPI,
    private readonly el: any,
  ) {}

  text(sel?: string): string | null {
    const ctx = sel ? this.$(sel, this.el) : this.$(this.el);
    const t = ctx.text();
    return t && t.length ? t.trim() : null;
  }

  attr(name: string, sel?: string): string | null {
    const ctx = sel ? this.$(sel, this.el) : this.$(this.el);
    const v = ctx.attr(name);
    return v ?? null;
  }

  list(sel: string): DomRead[] {
    return this.$(sel, this.el)
      .toArray()
      .map((e) => new CheerioDomRead(this.$, e));
  }

  exists(sel: string): boolean {
    return this.$(sel, this.el).length > 0;
  }

  static fromHtml(html: string): CheerioDomRead {
    const $ = cheerio.load(html);
    return new CheerioDomRead($, $.root());
  }
}
