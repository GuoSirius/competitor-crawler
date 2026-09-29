<script setup lang="ts">
import { ref, onMounted } from 'vue';

interface Alert {
  id: number;
  type: string;
  severity: string;
  message: string;
  status: string;
  payload: Record<string, unknown> | null;
  createdAt: number;
}

const alerts = ref<Alert[]>([]);
const loading = ref(true);

const severityClass: Record<string, string> = {
  error: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
  warning: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400',
  info: 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300',
};

onMounted(async () => {
  try {
    alerts.value = await $fetch<Alert[]>('/api/alerts');
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="space-y-4">
    <div v-if="loading" class="card p-8 text-center text-gray-400 dark:text-slate-500 text-sm">加载中…</div>

    <div v-else class="card overflow-x-auto">
      <table class="w-full">
        <thead class="bg-gray-50 dark:bg-slate-900/60 border-b border-gray-200 dark:border-slate-700">
          <tr>
            <th class="th">类型</th>
            <th class="th">级别</th>
            <th class="th">信息</th>
            <th class="th">状态</th>
            <th class="th">创建时间</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100 dark:divide-slate-700/60">
          <tr v-for="a in alerts" :key="a.id" class="hover:bg-gray-50 dark:hover:bg-slate-700/40 transition-colors">
            <td class="td font-mono text-xs">{{ a.type }}</td>
            <td class="td">
              <span class="px-2 py-0.5 rounded-full text-xs font-medium" :class="severityClass[a.severity] ?? severityClass.info">
                {{ a.severity }}
              </span>
            </td>
            <td class="td">{{ a.message }}</td>
            <td class="td">
              <span
                class="px-2 py-0.5 rounded-full text-xs font-medium"
                :class="a.status === 'open' ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400' : 'bg-gray-100 text-gray-500 dark:bg-slate-700 dark:text-slate-400'"
              >
                {{ a.status }}
              </span>
            </td>
            <td class="td text-gray-400 dark:text-slate-500 text-xs">{{ new Date(a.createdAt * 1000).toLocaleString() }}</td>
          </tr>
          <tr v-if="alerts.length === 0">
            <td colspan="5" class="td text-center text-gray-400 dark:text-slate-500 py-8">暂无告警 🎉</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
