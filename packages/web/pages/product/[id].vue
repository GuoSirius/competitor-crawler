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
    <NuxtLink to="/" class="text-brand hover:underline text-sm">← 返回看板</NuxtLink>
    <div v-if="error" class="text-red-600">{{ error }}</div>
    <div v-else-if="p" class="bg-white rounded shadow p-6 space-y-3">
      <h1 class="text-2xl font-bold">{{ p.name || p.englishName || '(未命名)' }}</h1>
      <p class="text-gray-500">{{ p.englishName }} · {{ p.brand }}</p>
      <div class="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
        <div><span class="text-gray-400">公司</span><div>{{ p.company }}</div></div>
        <div><span class="text-gray-400">品类</span><div>{{ p.category }}</div></div>
        <div><span class="text-gray-400">克隆号</span><div>{{ p.cloneNumber || '—' }}</div></div>
        <div><span class="text-gray-400">价格</span><div>{{ p.priceText || (p.price != null ? p.price + ' ' + (p.currency ?? '') : '—') }}</div></div>
        <div><span class="text-gray-400">规格</span><div>{{ p.specText || '—' }}</div></div>
        <div><span class="text-gray-400">状态</span><div>{{ p.status }} / 栏目 {{ p.sectionKey }}</div></div>
      </div>
      <div v-if="p.description"><span class="text-gray-400 text-sm">描述</span><p class="mt-1 whitespace-pre-wrap">{{ p.description }}</p></div>
      <div v-if="p.applications?.length"><span class="text-gray-400 text-sm">应用</span><p class="mt-1">{{ p.applications.join('、') }}</p></div>
      <div v-if="p.detailUrl">
        <a :href="p.detailUrl" target="_blank" rel="noreferrer" class="text-brand hover:underline">查看原始页面 ↗</a>
      </div>
      <details class="text-xs text-gray-500">
        <summary>原始字段 (row JSON)</summary>
        <pre class="mt-2 bg-gray-50 p-3 rounded overflow-x-auto">{{ JSON.stringify(p.row, null, 2) }}</pre>
      </details>
    </div>
  </div>
</template>
