<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const id = route.params.id as string;
const p = ref<any>(null);
const error = ref('');

onMounted(async () => {
  try {
    p.value = await $fetch<any>(`/api/products/${id}`);
  } catch (e: any) {
    error.value = e?.statusMessage || '加载失败';
  }
});
</script>

<template>
  <div class="space-y-4">
    <NuxtLink to="/" class="link text-sm inline-flex items-center gap-1">← 返回看板</NuxtLink>

    <div v-if="error" class="card p-6 text-red-600 dark:text-red-400">{{ error }}</div>

    <div v-else-if="p" class="card p-6 space-y-4">
      <div class="border-b border-gray-200 dark:border-slate-700 pb-4">
        <h1 class="text-2xl font-bold">{{ p.name || p.englishName || '(未命名)' }}</h1>
        <p class="text-gray-500 dark:text-slate-400 text-sm mt-1">{{ p.englishName }} · {{ p.brand }}</p>
      </div>

      <div class="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
        <div class="bg-gray-50 dark:bg-slate-900/60 rounded-md p-3">
          <span class="text-xs text-gray-400 dark:text-slate-500">公司</span>
          <div class="mt-0.5">{{ p.company }}</div>
        </div>
        <div class="bg-gray-50 dark:bg-slate-900/60 rounded-md p-3">
          <span class="text-xs text-gray-400 dark:text-slate-500">品类</span>
          <div class="mt-0.5">{{ p.category }}</div>
        </div>
        <div class="bg-gray-50 dark:bg-slate-900/60 rounded-md p-3">
          <span class="text-xs text-gray-400 dark:text-slate-500">克隆号</span>
          <div class="mt-0.5 font-mono text-xs">{{ p.cloneNumber || '—' }}</div>
        </div>
        <div class="bg-gray-50 dark:bg-slate-900/60 rounded-md p-3">
          <span class="text-xs text-gray-400 dark:text-slate-500">价格</span>
          <div class="mt-0.5">{{ p.priceText || (p.price != null ? p.price + ' ' + (p.currency ?? '') : '—') }}</div>
        </div>
        <div class="bg-gray-50 dark:bg-slate-900/60 rounded-md p-3">
          <span class="text-xs text-gray-400 dark:text-slate-500">规格</span>
          <div class="mt-0.5">{{ p.specText || '—' }}</div>
        </div>
        <div class="bg-gray-50 dark:bg-slate-900/60 rounded-md p-3">
          <span class="text-xs text-gray-400 dark:text-slate-500">状态</span>
          <div class="mt-0.5">{{ p.status }} / 栏目 {{ p.sectionKey }}</div>
        </div>
      </div>

      <div v-if="p.description">
        <span class="text-xs text-gray-400 dark:text-slate-500">描述</span>
        <p class="mt-1 whitespace-pre-wrap text-sm">{{ p.description }}</p>
      </div>

      <div v-if="p.applications?.length">
        <span class="text-xs text-gray-400 dark:text-slate-500">应用</span>
        <p class="mt-1 text-sm">{{ p.applications.join('、') }}</p>
      </div>

      <div v-if="p.detailUrl">
        <a :href="p.detailUrl" target="_blank" rel="noreferrer" class="link text-sm">查看原始页面 ↗</a>
      </div>

      <details class="text-xs text-gray-500 dark:text-slate-400">
        <summary class="cursor-pointer select-none">原始字段 (row JSON)</summary>
        <pre class="mt-2 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 p-3 rounded-md overflow-x-auto">{{ JSON.stringify(p.row, null, 2) }}</pre>
      </details>
    </div>
  </div>
</template>
