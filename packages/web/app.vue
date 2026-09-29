<script setup lang="ts">
// 根组件：布局出口 + 主题（默认暗黑，<html class="dark">）
const { isDark } = useTheme();
useHead({
  title: '竞品爬虫平台',
  htmlAttrs: {
    class: () => (isDark.value ? 'dark' : ''),
  },
});
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
