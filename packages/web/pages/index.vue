<script setup lang="ts">
import { ref, onMounted, watch, nextTick } from 'vue';
import * as echarts from 'echarts';
import { useTheme } from '~/composables/useTheme';

interface Product {
  id: number;
  name: string | null;
  englishName: string | null;
  brand: string | null;
  price: number | null;
  currency: string | null;
  priceText: string | null;
  specText: string | null;
  cloneNumber: string | null;
  status: string;
  sectionKey: string;
  detailUrl: string | null;
  lastSeenAt: number | null;
  company: string | null;
  category: string | null;
}

const { isDark } = useTheme();

const companies = ref<{ id: number; name: string }[]>([]);
const categories = ref<{ id: number; name: string }[]>([]);
const items = ref<Product[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = 20;

const filters = ref({ company: '', category: '', status: 'active', q: '', hasClone: false });

const chartEl = ref<HTMLElement | null>(null);
let chart: ReturnType<typeof echarts.init> | null = null;

async function loadOptions() {
  companies.value = await $fetch<{ id: number; name: string }[]>('/api/companies');
  categories.value = await $fetch<{ id: number; name: string }[]>('/api/categories');
}

async function loadProducts() {
  const params: Record<string, string> = {
    page: String(page.value),
    pageSize: String(pageSize),
    status: filters.value.status,
  };
  if (filters.value.company) params.company = filters.value.company;
  if (filters.value.category) params.category = filters.value.category;
  if (filters.value.q) params.q = filters.value.q;
  if (filters.value.hasClone) params.hasClone = '1';
  const res = await $fetch<{ items: Product[]; total: number }>('/api/products', { query: params });
  items.value = res.items;
  total.value = res.total;
}

async function loadStats() {
  const stats = await $fetch<{ company: string; count: number }[]>('/api/stats');
  if (!chartEl.value) return;
  // 主题切换时重建实例（echarts 主题在 init 时固定）
  chart?.dispose();
  chart = echarts.init(chartEl.value, isDark.value ? 'dark' : undefined);
  chart.setOption({
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 80, right: 20, top: 20, bottom: 60 },
    xAxis: { type: 'category', data: stats.map((s) => s.company), axisLabel: { rotate: 30 } },
    yAxis: { type: 'value' },
    series: [{ type: 'bar', data: stats.map((s) => s.count), itemStyle: { color: '#1668dc' } }],
  });
}

function resetPage() {
  page.value = 1;
  loadProducts();
}

onMounted(async () => {
  await loadOptions();
  await loadProducts();
  await nextTick();
  await loadStats();
  window.addEventListener('resize', () => chart?.resize());
});

watch(isDark, () => loadStats());
watch(() => filters.value, resetPage, { deep: true });
</script>

<template>
  <div class="space-y-4">
    <!-- 筛选区 -->
    <div class="card p-4 grid grid-cols-2 md:grid-cols-5 gap-3">
      <select v-model="filters.company" class="input">
        <option value="">全部公司</option>
        <option v-for="c in companies" :key="c.id" :value="c.name">{{ c.name }}</option>
      </select>
      <select v-model="filters.category" class="input">
        <option value="">全部品类</option>
        <option v-for="c in categories" :key="c.id" :value="c.name">{{ c.name }}</option>
      </select>
      <select v-model="filters.status" class="input">
        <option value="active">活跃</option>
        <option value="delisted">已下架</option>
      </select>
      <input v-model="filters.q" placeholder="搜索名称…" class="input" @keyup.enter="resetPage" />
      <label class="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-300 select-none cursor-pointer">
        <input v-model="filters.hasClone" type="checkbox" class="accent-brand" /> 仅看有克隆号
      </label>
    </div>

    <!-- 各公司产品数 -->
    <div class="card p-4">
      <h2 class="text-sm font-semibold text-gray-600 dark:text-slate-300 mb-2">各公司产品数</h2>
      <div ref="chartEl" style="height: 280px"></div>
    </div>

    <!-- 产品表 -->
    <div class="card overflow-x-auto">
      <table class="w-full">
        <thead class="bg-gray-50 dark:bg-slate-900/60 border-b border-gray-200 dark:border-slate-700">
          <tr>
            <th class="th">产品</th>
            <th class="th">公司</th>
            <th class="th">品类</th>
            <th class="th">克隆号</th>
            <th class="th">价格</th>
            <th class="th">规格</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100 dark:divide-slate-700/60">
          <tr v-for="p in items" :key="p.id" class="hover:bg-gray-50 dark:hover:bg-slate-700/40 transition-colors">
            <td class="td">
              <NuxtLink :to="`/product/${p.id}`" class="link font-medium">
                {{ p.name || p.englishName || '(未命名)' }}
              </NuxtLink>
            </td>
            <td class="td">{{ p.company }}</td>
            <td class="td">
              <span v-if="p.category" class="px-1.5 py-0.5 rounded bg-brand/10 text-brand dark:bg-brand/20 dark:text-blue-400 text-xs">
                {{ p.category }}
              </span>
              <span v-else class="text-gray-400 dark:text-slate-500">—</span>
            </td>
            <td class="td font-mono text-xs">{{ p.cloneNumber ?? '—' }}</td>
            <td class="td">{{ p.priceText || (p.price != null ? p.price + ' ' + (p.currency ?? '') : '—') }}</td>
            <td class="td">{{ p.specText || '—' }}</td>
          </tr>
          <tr v-if="items.length === 0">
            <td colspan="6" class="td text-center text-gray-400 dark:text-slate-500 py-8">暂无数据</td>
          </tr>
        </tbody>
      </table>
      <div class="px-4 py-2.5 text-sm text-gray-500 dark:text-slate-400 flex items-center gap-3 border-t border-gray-100 dark:border-slate-700/60">
        <span>共 {{ total }} 条</span>
        <div class="ml-auto flex items-center gap-2">
          <button class="btn-ghost !h-7 !px-2.5 text-xs" :disabled="page <= 1" @click="page--; loadProducts()">上一页</button>
          <span>第 {{ page }} 页</span>
          <button class="btn-ghost !h-7 !px-2.5 text-xs" :disabled="page * pageSize >= total" @click="page++; loadProducts()">下一页</button>
        </div>
      </div>
    </div>
  </div>
</template>
