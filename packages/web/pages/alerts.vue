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

onMounted(async () => {
  alerts.value = await $fetch<Alert[]>('/api/alerts');
});
</script>

<template>
  <div class="space-y-4">
    <h1 class="text-xl font-bold">告警面板</h1>
    <div class="bg-white rounded shadow overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-gray-100 text-left">
          <tr>
            <th class="px-3 py-2">类型</th>
            <th class="px-3 py-2">级别</th>
            <th class="px-3 py-2">信息</th>
            <th class="px-3 py-2">状态</th>
            <th class="px-3 py-2">创建时间</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="a in alerts" :key="a.id" class="border-t hover:bg-gray-50">
            <td class="px-3 py-2">{{ a.type }}</td>
            <td class="px-3 py-2">
              <span :class="a.severity === 'error' ? 'text-red-600' : a.severity === 'warning' ? 'text-orange-500' : 'text-gray-500'">
                {{ a.severity }}
              </span>
            </td>
            <td class="px-3 py-2">{{ a.message }}</td>
            <td class="px-3 py-2">{{ a.status }}</td>
            <td class="px-3 py-2 text-gray-400">{{ new Date(a.createdAt * 1000).toLocaleString() }}</td>
          </tr>
          <tr v-if="alerts.length === 0">
            <td colspan="5" class="px-3 py-4 text-center text-gray-400">暂无告警 🎉</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
