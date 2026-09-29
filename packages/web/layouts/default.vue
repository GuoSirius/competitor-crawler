<script setup lang="ts">
import { MENU, findMenuLabel } from '~/config/menu';

const collapsed = useState('sidebar-collapsed', () => false);
const { isDark, toggle } = useTheme();
const route = useRoute();

// 顶栏标题：菜单命中显示菜单名，详情页回退到上级菜单，兜底「竞品爬虫平台」
const pageTitle = computed(() => {
  const hit = findMenuLabel(route.path);
  if (hit) return hit;
  if (route.path.startsWith('/product/')) return '产品详情';
  return '竞品爬虫平台';
});

function isActive(to: string) {
  return to === '/' ? route.path === '/' : route.path.startsWith(to);
}
</script>

<template>
  <div class="min-h-screen bg-gray-100 dark:bg-slate-950 text-gray-800 dark:text-slate-200">
    <!-- 侧边菜单 -->
    <aside
      class="fixed inset-y-0 left-0 z-20 flex flex-col bg-white dark:bg-slate-900 border-r border-gray-200 dark:border-slate-800 transition-all duration-200"
      :class="collapsed ? 'w-14' : 'w-56'"
    >
      <div class="h-12 flex items-center gap-2 px-3 border-b border-gray-200 dark:border-slate-800 shrink-0">
        <div class="w-7 h-7 rounded-md bg-brand flex items-center justify-center text-white text-xs font-bold shrink-0">CC</div>
        <span v-if="!collapsed" class="font-bold text-sm truncate">竞品爬虫平台</span>
      </div>

      <nav class="flex-1 overflow-y-auto py-2">
        <div v-for="g in MENU" :key="g.title" class="mb-1">
          <div v-if="!collapsed" class="px-4 pt-2.5 pb-1 text-[11px] font-medium uppercase tracking-wider text-gray-400 dark:text-slate-500">
            {{ g.title }}
          </div>
          <div v-else class="mx-2 my-1 border-t border-gray-100 dark:border-slate-800"></div>
          <template v-for="it in g.items" :key="it.to">
            <NuxtLink
              v-if="!it.disabled"
              :to="it.to"
              class="menu-item"
              :class="isActive(it.to) ? 'menu-item-active' : ''"
              :title="collapsed ? it.label : undefined"
            >
              <AppIcon :name="it.icon" />
              <span v-if="!collapsed" class="truncate">{{ it.label }}</span>
              <span
                v-if="it.badge && !collapsed"
                class="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-slate-500"
              >
                {{ it.badge }}
              </span>
            </NuxtLink>
            <div
              v-else
              class="menu-item opacity-50 cursor-not-allowed"
              :title="collapsed ? it.label : `${it.label}（${it.badge ?? '开发中'}）`"
            >
              <AppIcon :name="it.icon" />
              <span v-if="!collapsed" class="truncate">{{ it.label }}</span>
            </div>
          </template>
        </div>
      </nav>

      <div class="p-2 border-t border-gray-200 dark:border-slate-800 text-center text-[10px] text-gray-400 dark:text-slate-600 shrink-0">
        <span v-if="!collapsed">internal · v1.0</span>
        <span v-else>v1</span>
      </div>
    </aside>

    <!-- 右侧：顶栏 + 内容区 -->
    <div class="transition-all duration-200" :class="collapsed ? 'pl-14' : 'pl-56'">
      <header
        class="h-12 sticky top-0 z-10 flex items-center gap-3 px-4 bg-white/90 dark:bg-slate-900/90 backdrop-blur border-b border-gray-200 dark:border-slate-800"
      >
        <button
          class="w-8 h-8 flex items-center justify-center rounded-md text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          title="收起 / 展开菜单"
          @click="collapsed = !collapsed"
        >
          <AppIcon name="chevrons-left" :class="collapsed ? 'rotate-180' : ''" class="transition-transform" />
        </button>
        <span class="text-sm font-medium text-gray-600 dark:text-slate-300">{{ pageTitle }}</span>
        <div class="ml-auto flex items-center gap-1">
          <button
            class="w-8 h-8 flex items-center justify-center rounded-md text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            :title="isDark ? '切换到亮色' : '切换到暗黑'"
            @click="toggle"
          >
            <AppIcon :name="isDark ? 'sun' : 'moon'" />
          </button>
        </div>
      </header>

      <main class="p-5">
        <div class="max-w-[1440px] mx-auto">
          <NuxtPage />
        </div>
      </main>
    </div>
  </div>
</template>
