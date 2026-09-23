import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import type { DomRead } from '@competitor-crawler/shared';

/** 基于 cheerio 的 DomRead 实现（SSR 静态页解析用） */
export class CheerioDomRead implements DomRead {
  constructor(
    private readonly $: cheerio.CheerioAPI,
    private readonly el: Element | cheerio.Cheerio<Element>,
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
