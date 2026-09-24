// 一次性迁移：把旧的公司名（含国家/城市前缀、别名、重复）改名为 canonical 名，
// 并合并重复公司（上海逍鹏 / 逍鹏生物 -> 同一行，重指 categories 后删除孤儿）。
// 必须在 `pnpm seed` 之前运行，避免 loadSeeds 按新名 upsert 时留下孤儿旧行、丢产品。
import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 仓库根 = packages/shared 上溯两级（相对脚本定位，换机器/挪目录均可用）
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const dbPath = path.join(REPO, 'data', 'crawler.sqlite');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// 旧名 -> canonical 名
const OLD_TO_NEW = {
  '美国ATCC': 'ATCC',
  '德国promocell': 'PromoCell',
  '德国cytion': 'Cytion',
  '上海中乔新舟': '上海中乔新舟生物科技有限公司',
  '上海赛百慷': '赛百慷（上海）生物技术股份有限公司',
  '上海富衡': '上海富衡生物科技有限公司',
  '苏州海星': '苏州海星生物科技有限公司',
  '浙江美森': '浙江美森细胞科技有限公司',
  '广州赛业': '赛业（广州）生物科技有限公司',
  '厦门逸漠': '厦门逸漠生物科技有限公司',
  '赛默飞': '赛默飞（Thermo Fisher Scientific）',
  'stemcell': 'STEMCELL Technologies',
  'sciencell': 'ScienCell Research Laboratories',
  '德国Capricorn': 'Capricorn Scientific',
  '默克': '默克（Merck）',
  '康宁': '康宁（Corning）',
  '上海逍鹏': '上海逍鹏生物科技有限公司',
  '上海源培': '上海源培生物科技股份有限公司',
  '依科赛': '苏州依科赛生物科技股份有限公司',
  '诺唯赞': '南京诺唯赞生物科技股份有限公司',
  'cytiva(HyClone)': 'Cytiva',
  '南京森贝伽': '南京森贝伽生物科技有限公司',
  '苏州双洳': '苏州双洳生物科技有限公司',
  '逍鹏生物': '上海逍鹏生物科技有限公司',
};

const getByName = db.prepare('SELECT id FROM companies WHERE name = ?');
const updName = db.prepare('UPDATE companies SET name = ?, updated_at = ? WHERE id = ?');
const repointCats = db.prepare('UPDATE categories SET company_id = ? WHERE company_id = ?');
const delCompany = db.prepare('DELETE FROM companies WHERE id = ?');
const ts = Math.floor(Date.now() / 1000);

const tx = db.transaction(() => {
  let renamed = 0, merged = 0;
  for (const [oldName, newName] of Object.entries(OLD_TO_NEW)) {
    const oldRow = getByName.get(oldName);
    if (!oldRow) { console.log('  (跳过) 旧名不存在:', oldName); continue; }
    const target = getByName.get(newName);
    if (target && target.id !== oldRow.id) {
      // 合并：把孤儿公司的 categories 指到幸存公司，再删除孤儿
      repointCats.run(target.id, oldRow.id);
      delCompany.run(oldRow.id);
      merged++;
      console.log(`  合并: "${oldName}"(#${oldRow.id}) -> "${newName}"(#${target.id})`);
    } else {
      updName.run(newName, ts, oldRow.id);
      renamed++;
      console.log(`  改名: "${oldName}"(#${oldRow.id}) -> "${newName}"`);
    }
  }
  return { renamed, merged };
});

const res = tx();
console.log('完成. 改名', res.renamed, '合并', res.merged);
// 校验
const cnt = db.prepare('SELECT COUNT(*) c FROM companies').get().c;
const dup = db.prepare('SELECT name, COUNT(*) n FROM companies GROUP BY name HAVING n > 1').all();
console.log('公司总数:', cnt, '重名:', dup.length ? dup : '无');
db.close();
