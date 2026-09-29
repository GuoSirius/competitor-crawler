<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';

interface ContentItem {
  id: number;
  contentType: string;
  title: string;
  summary: string | null;
  author: string | null;
  publishedAt: number | null;
  detailUrl: string | null;
  status: string;
  lastSeenAt: number | null;
  company: string | null;
}

const items = ref<ContentItem[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = 20;
const loading = ref(true);
const filters = ref({ contentType: '', company: '', q: '' });

async function load() {
  loading.value = true;
  try {
    const params: Record<string, string> = {
      page: String(page.value),
      pageSize: String(pageSize),
    };
    if (filters.value.contentType) params.contentType = filters.value.contentType;
    if (filters.value.company) params.company = filters.value.company;
    if (filters.value.q) params.q = filters.value.q;
    const res = await $fetch<{ items: ContentItem[]; total: number }>('/api/contents', { query: params });
    items.value = res.items;
    total.value = res.total;
  } finally {
    loading.value = false;
  }
}

function fmt(ts: number | null): string {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleDateString('zh-CN');
}

const typeClass: Record<string, string> = {
  news: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
  announcement: 'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400',
  event: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
};

onMounted(load);
watch(() => filters.value.contentType, () => { page.value = 1; load(); });
</script>

<template>
  <div class="space-y-4">
    <!-- 筛选区 -->
    <div class="card p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
      <select v-model="filters.contentType" class="input">
        <option value="">全部类型</option>
        <option value="news">新闻</option>
        <option value="announcement">公告</option>
        <option value="event">活动</option>
      </select>
      <input v-model="filters.company" placeholder="按公司筛选…" class="input" @keyup.enter="page = 1; load()" />
      <input v-model="filters.q" placeholder="搜索标题…" class="input" @keyup.enter="page = 1; load()" />
      <button class="btn-ghost" @click="page = 1; load()">查询</button>
    </div>

    <div v-if="loading" class="card p-8 text-center text-gray-400 dark:text-slate-500 text-sm">加载中…</div>

    <div v-else class="card overflow-x-auto">
      <table class="w-full">
        <thead class="bg-gray-50 dark:bg-slate-900/60 border-b border-gray-200 dark:border-slate-700">
          <tr>
            <th class="th">标题</th>
            <th class="th">类型</th>
            <th class="th">公司</th>
            <th class="th">发布时间</th>
            <th class="th">来源</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100 dark:divide-slate-700/60">
          <tr v-for="c in items" :key="c.id" class="hover:bg-gray-50 dark:hover:bg-slate-700/40 transition-colors align-top">
            <td class="td max-w-[480px]">
              <a v-if="c.detailUrl" :href="c.detailUrl" target="_blank" rel="noreferrer" class="link font-medium">
                {{ c.title }}
              </a>
              <span v-else class="font-medium">{{ c.title }}</span>
              <p v-if="c.summary" class="mt-0.5 text-xs text-gray-500 dark:text-slate-400 line-clamp-2">{{ c.summary }}</p>
            </td>
            <td class="td">
              <span class="px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap" :class="typeClass[c.contentType] ?? 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300'">
                {{ c.contentType }}
              </span>
            </td>
            <td class="td whitespace-nowrap">{{ c.company }}</td>
            <td class="td text-xs whitespace-nowrap">{{ fmt(c.publishedAt) }}</td>
            <td class="td text-xs text-gray-400 dark:text-slate-500 whitespace-nowrap">{{ c.author || '—' }}</td>
          </tr>
          <tr v-if="items.length === 0">
            <td colspan="5" class="td text-center text-gray-400 dark:text-slate-500 py-8">暂无资讯数据——给目标站点的 YAML 加一个 collects: news 的栏目即可开始采集</td>
          </tr>
        </tbody>
      </table>
      <div class="px-4 py-2.5 text-sm text-gray-500 dark:text-slate-400 flex items-center gap-3 border-t border-gray-100 dark:border-slate-700/60">
        <span>共 {{ total }} 条</span>
        <div class="ml-auto flex items-center gap-2">
          <button class="btn-ghost !h-7 !px-2.5 text-xs" :disabled="page <= 1" @click="page--; load()">上一页</button>
          <span>第 {{ page }} 页</span>
          <button class="btn-ghost !h-7 !px-2.5 text-xs" :disabled="page * pageSize >= total" @click="page++; load()">下一页</button>
        </div>
      </div>
    </div>
  </div>
</template>
