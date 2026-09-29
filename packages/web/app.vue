<script setup lang="ts">
// 根布局：顶部导航 + 页面出口
const nav = [
  { to: '/', label: '对标看板' },
  { to: '/alerts', label: '告警面板' },
  { to: '/sites', label: '站点管理' },
];
</script>

<template>
  <div class="min-h-screen bg-gray-50 text-gray-800">
    <header class="bg-brand text-white px-6 py-3 flex items-center gap-6 shadow">
      <span class="font-bold text-lg">竞品爬虫 · 内部平台</span>
      <nav class="flex gap-4 text-sm">
        <NuxtLink
          v-for="item in nav"
          :key="item.to"
          :to="item.to"
          class="px-2 py-1 rounded hover:bg-white/20"
          active-class="bg-white/25"
        >
          {{ item.label }}
        </NuxtLink>
      </nav>
    </header>
    <main class="p-6">
      <NuxtPage />
    </main>
  </div>
</template>
