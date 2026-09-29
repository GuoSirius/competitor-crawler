// 侧边菜单配置：新增页面只需在此加一行（页面文件 + API 就绪后把 disabled 去掉即可）
export interface MenuItem {
  to: string;
  label: string;
  icon: string;
  badge?: string;
  disabled?: boolean;
}
export interface MenuGroup {
  title: string;
  items: MenuItem[];
}

export const MENU: MenuGroup[] = [
  {
    title: '数据',
    items: [
      { to: '/', label: '对标看板', icon: 'dashboard' },
      { to: '/contents', label: '资讯动态', icon: 'news' },
    ],
  },
  {
    title: '监控',
    items: [{ to: '/alerts', label: '告警面板', icon: 'bell' }],
  },
  {
    title: '配置',
    items: [{ to: '/sites', label: '站点管理', icon: 'globe' }],
  },
];

/** 按路径反查菜单标题（顶栏面包屑用）；未命中（如产品详情页）返回空 */
export function findMenuLabel(path: string): string {
  for (const g of MENU) {
    for (const it of g.items) {
      if (it.to === path && it.to !== '/') return it.label;
    }
  }
  return '';
}
