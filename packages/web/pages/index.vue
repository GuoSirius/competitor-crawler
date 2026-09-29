<script setup lang="ts">
import { ref, onMounted, watch, nextTick } from 'vue';
import * as echarts from 'echarts';

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
  chart ??= echarts.init(chartEl.value);
  chart.setOption({
    tooltip: {},
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
  await loadStats();
  await nextTick();
  window.addEventListener('resize', () => chart?.resize());
});

watch(() => filters.value, resetPage, { deep: true });
</script>

<template>
  <div class="space-y-4">
    <h1 class="text-xl font-bold">对标看板</h1>

    <div class="bg-white rounded shadow p-4 grid grid-cols-2 md:grid-cols-5 gap-3">
      <select v-model="filters.company" class="border rounded px-2 py-1">
        <option value="">全部公司</option>
        <option v-for="c in companies" :key="c.id" :value="c.name">{{ c.name }}</option>
      </select>
      <select v-model="filters.category" class="border rounded px-2 py-1">
        <option value="">全部品类</option>
        <option v-for="c in categories" :key="c.id" :value="c.name">{{ c.name }}</option>
      </select>
      <select v-model="filters.status" class="border rounded px-2 py-1">
        <option value="active">活跃</option>
        <option value="delisted">已下架</option>
      </select>
      <input v-model="filters.q" placeholder="搜索名称" class="border rounded px-2 py-1" @keyup.enter="resetPage" />
      <label class="flex items-center gap-1 text-sm">
        <input v-model="filters.hasClone" type="checkbox" /> 仅看有克隆号
      </label>
    </div>

    <div class="bg-white rounded shadow p-4">
      <div ref="chartEl" style="height: 280px"></div>
    </div>

    <div class="bg-white rounded shadow overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-gray-100 text-left">
          <tr>
            <th class="px-3 py-2">产品</th>
            <th class="px-3 py-2">公司</th>
            <th class="px-3 py-2">品类</th>
            <th class="px-3 py-2">克隆号</th>
            <th class="px-3 py-2">价格</th>
            <th class="px-3 py-2">规格</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in items" :key="p.id" class="border-t hover:bg-gray-50">
            <td class="px-3 py-2">
              <NuxtLink :to="`/product/${p.id}`" class="text-brand hover:underline">
                {{ p.name || p.englishName || '(未命名)' }}
              </NuxtLink>
            </td>
            <td class="px-3 py-2">{{ p.company }}</td>
            <td class="px-3 py-2">{{ p.category }}</td>
            <td class="px-3 py-2">{{ p.cloneNumber ?? '—' }}</td>
            <td class="px-3 py-2">{{ p.priceText || (p.price != null ? p.price + ' ' + (p.currency ?? '') : '—') }}</td>
            <td class="px-3 py-2">{{ p.specText || '—' }}</td>
          </tr>
        </tbody>
      </table>
      <div class="px-3 py-2 text-sm text-gray-500 flex items-center gap-3">
        <span>共 {{ total }} 条</span>
        <button class="px-2 py-1 border rounded disabled:opacity-40" :disabled="page <= 1" @click="page--; loadProducts()">上一页</button>
        <span>第 {{ page }} 页</span>
        <button class="px-2 py-1 border rounded disabled:opacity-40" :disabled="page * pageSize >= total" @click="page++; loadProducts()">下一页</button>
      </div>
    </div>
  </div>
</template>
