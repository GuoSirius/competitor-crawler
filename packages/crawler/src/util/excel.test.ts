import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { cellText, cellUrl, detectColumns, headerRow } from './excel.js';

function sheetWithCells(build: (ws: ExcelJS.Worksheet) => void): ExcelJS.Worksheet {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('t');
  build(ws);
  return ws;
}

describe('util/excel（docs/16 M9 收敛）', () => {
  it('cellText：文本 trim / 数字 / 富文本 / 空 → null', () => {
    const ws = sheetWithCells((ws) => {
      ws.getCell('A1').value = '  hello  ';
      ws.getCell('A2').value = 42;
      ws.getCell('A3').value = { richText: [{ text: 'rich' }, { text: 'Text' }] };
      ws.getCell('A4').value = '   ';
    });
    expect(cellText(ws.getCell('A1'))).toBe('hello');
    expect(cellText(ws.getCell('A2'))).toBe('42');
    expect(cellText(ws.getCell('A3'))).toBe('richText');
    expect(cellText(ws.getCell('A4'))).toBeNull();
  });

  it('cellUrl：优先超链接，退回 http(s) 文本，非 URL 文本 → null', () => {
    const ws = sheetWithCells((ws) => {
      ws.getCell('A1').value = { text: '品类页', hyperlink: 'https://x.com/list' };
      ws.getCell('A2').value = 'https://y.com/p1';
      ws.getCell('A3').value = '不是链接';
    });
    expect(cellUrl(ws.getCell('A1'))).toBe('https://x.com/list');
    expect(cellUrl(ws.getCell('A2'))).toBe('https://y.com/p1');
    expect(cellUrl(ws.getCell('A3'))).toBeNull();
  });

  it('headerRow：1-based 列 → 0-based 下标数组', () => {
    const ws = sheetWithCells((ws) => {
      ws.getRow(1).values = ['', '公司', '品类链接'];
    });
    expect(headerRow(ws)).toEqual([null, '公司', '品类链接']);
  });

  it('detectColumns：关键字命中取最靠前列，未命中不出现', () => {
    const cols = detectColumns(['备注', '公司名称', '竞品品类链接', '官网链接'], [
      { field: 'company', keys: ['公司'] },
      { field: 'catLink', keys: ['竞品品类链接', '品类链接'] },
      { field: 'missing', keys: ['不存在'] },
    ]);
    expect(cols).toEqual({ company: 1, catLink: 2 });
  });
});
