import { defineEventHandler, readBody, createError, getHeader } from 'h3';
import fs from 'node:fs';
import path from 'node:path';
import { repoRoot } from '@competitor-crawler/shared';
import { buildSiteYaml, validateSiteInput } from '../utils/siteInput.js';

const sitesDir = path.join(repoRoot, 'config', 'sites');

/**
 * 写端点鉴权：生产环境（配置了 WEB_TOKEN）必须通过 `x-web-token` 头带上令牌，否则 401；
 * 未配置 WEB_TOKEN 视为 dev 模式（本机自助加站点，不卡自己）。
 * 配合 nuxt.config 的 devServer.host='0.0.0.0' 仅 dev 生效，避免写端点在局域网零鉴权暴露。
 */
function assertAuthorized(event: Parameters<Parameters<typeof defineEventHandler>[0]>[0]): void {
  const token = process.env.WEB_TOKEN;
  if (!token) return; // dev 放行
  const provided = getHeader(event, 'x-web-token');
  if (provided !== token) {
    throw createError({ statusCode: 401, statusMessage: '未授权：缺少或错误的 x-web-token' });
  }
}

// 从模板新建站点 YAML（同事自助加站点：填表 → 生成配置 → 再用 pnpm probe 验证）
export default defineEventHandler(async (event) => {
  assertAuthorized(event);
  const body = (await readBody(event)) ?? {};
  // 纯校验/拼装逻辑在 server/utils/siteInput.ts（可单测）；此处只做 h3 错误映射与写盘
  const input = validateSiteInput(body);
  if (!input.ok) throw createError({ statusCode: 400, statusMessage: input.statusMessage });

  const target = path.join(sitesDir, `${input.domain}.yaml`);
  if (fs.existsSync(target)) throw createError({ statusCode: 409, statusMessage: '该域名配置已存在' });

  fs.mkdirSync(sitesDir, { recursive: true });
  fs.writeFileSync(target, buildSiteYaml(input), 'utf8');
  return { ok: true, domain: input.domain, file: `${input.domain}.yaml` };
});
