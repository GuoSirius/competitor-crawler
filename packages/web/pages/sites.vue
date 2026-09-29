<script setup lang="ts">
import { ref, onMounted } from 'vue';

interface Site {
  domain: string;
  file: string;
  company: string;
  currency: string;
  sectionCount: number;
}

const sites = ref<Site[]>([]);
const selected = ref<{ domain: string; content: string } | null>(null);
const showAdd = ref(false);
const form = ref({ domain: '', company: '', startUrl: '', category: '' });
const msg = ref('');

async function loadSites() {
  sites.value = await $fetch<Site[]>('/api/sites');
}
async function viewYaml(domain: string) {
  selected.value = await $fetch<{ domain: string; content: string }>(`/api/sites/${domain}`);
}
async function submitAdd() {
  msg.value = '';
  try {
    const r = await $fetch('/api/sites', { method: 'POST', body: form.value });
    msg.value = `已生成 ${r.file}，请运行 pnpm probe --domain ${r.domain} 验证后再爬取`;
    showAdd.value = false;
    form.value = { domain: '', company: '', startUrl: '', category: '' };
    await loadSites();
  } catch (e: any) {
    msg.value = '失败：' + (e?.statusMessage || e?.message || '未知错误');
  }
}

onMounted(loadSites);
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-bold">站点管理</h1>
      <button class="bg-brand text-white px-3 py-1 rounded" @click="showAdd = !showAdd">+ 新增站点</button>
    </div>

    <div v-if="msg" class="bg-green-50 text-green-700 border border-green-200 rounded p-2 text-sm">{{ msg }}</div>

    <div v-if="showAdd" class="bg-white rounded shadow p-4 grid grid-cols-2 gap-3 max-w-lg">
      <input v-model="form.domain" placeholder="域名（如 www.foo.com）" class="border rounded px-2 py-1" />
      <input v-model="form.company" placeholder="公司名" class="border rounded px-2 py-1" />
      <input v-model="form.startUrl" placeholder="列表页 URL" class="border rounded px-2 py-1 col-span-2" />
      <input v-model="form.category" placeholder="默认品类名（可选）" class="border rounded px-2 py-1 col-span-2" />
      <button class="bg-brand text-white px-3 py-1 rounded col-span-2" @click="submitAdd">生成 YAML 配置</button>
    </div>

    <div class="bg-white rounded shadow overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-gray-100 text-left">
          <tr>
            <th class="px-3 py-2">域名</th>
            <th class="px-3 py-2">公司</th>
            <th class="px-3 py-2">栏目数</th>
            <th class="px-3 py-2">币种</th>
            <th class="px-3 py-2">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in sites" :key="s.domain" class="border-t hover:bg-gray-50">
            <td class="px-3 py-2">{{ s.domain }}</td>
            <td class="px-3 py-2">{{ s.company || '—' }}</td>
            <td class="px-3 py-2">{{ s.sectionCount }}</td>
            <td class="px-3 py-2">{{ s.currency || '—' }}</td>
            <td class="px-3 py-2"><button class="text-brand hover:underline" @click="viewYaml(s.domain)">查看 YAML</button></td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="selected" class="bg-white rounded shadow p-4">
      <div class="flex items-center justify-between mb-2">
        <h2 class="font-semibold">{{ selected.domain }}</h2>
        <button class="text-gray-400 text-sm" @click="selected = null">关闭</button>
      </div>
      <pre class="bg-gray-50 p-3 rounded text-xs overflow-x-auto">{{ selected.content }}</pre>
    </div>
  </div>
</template>
