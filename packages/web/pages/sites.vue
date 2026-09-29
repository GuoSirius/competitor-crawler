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
const msgOk = ref(true);

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
    msgOk.value = true;
    msg.value = `已生成 ${r.file}，请运行 pnpm probe --domain ${r.domain} 验证后再爬取`;
    showAdd.value = false;
    form.value = { domain: '', company: '', startUrl: '', category: '' };
    await loadSites();
  } catch (e: any) {
    msgOk.value = false;
    msg.value = '失败：' + (e?.statusMessage || e?.message || '未知错误');
  }
}

onMounted(loadSites);
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <p class="text-sm text-gray-500 dark:text-slate-400">共 {{ sites.length }} 个站点配置</p>
      <button class="btn-primary" @click="showAdd = !showAdd">+ 新增站点</button>
    </div>

    <div
      v-if="msg"
      class="rounded-md px-3 py-2 text-sm border"
      :class="msgOk
        ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-500/10 dark:text-green-400 dark:border-green-500/30'
        : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/30'"
    >
      {{ msg }}
    </div>

    <!-- 新增站点表单 -->
    <div v-if="showAdd" class="card p-4 grid grid-cols-2 gap-3 max-w-xl">
      <input v-model="form.domain" placeholder="域名（如 www.foo.com）" class="input" />
      <input v-model="form.company" placeholder="公司名" class="input" />
      <input v-model="form.startUrl" placeholder="列表页 URL" class="input col-span-2" />
      <input v-model="form.category" placeholder="默认品类名（可选）" class="input col-span-2" />
      <button class="btn-primary col-span-2" @click="submitAdd">生成 YAML 配置</button>
    </div>

    <!-- 站点列表 -->
    <div class="card overflow-x-auto">
      <table class="w-full">
        <thead class="bg-gray-50 dark:bg-slate-900/60 border-b border-gray-200 dark:border-slate-700">
          <tr>
            <th class="th">域名</th>
            <th class="th">公司</th>
            <th class="th">栏目数</th>
            <th class="th">币种</th>
            <th class="th">操作</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100 dark:divide-slate-700/60">
          <tr v-for="s in sites" :key="s.domain" class="hover:bg-gray-50 dark:hover:bg-slate-700/40 transition-colors">
            <td class="td font-mono text-xs">{{ s.domain }}</td>
            <td class="td">{{ s.company || '—' }}</td>
            <td class="td">{{ s.sectionCount }}</td>
            <td class="td">
              <span v-if="s.currency" class="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-slate-700 text-xs">{{ s.currency }}</span>
              <span v-else class="text-gray-400 dark:text-slate-500">—</span>
            </td>
            <td class="td"><button class="link text-sm" @click="viewYaml(s.domain)">查看 YAML</button></td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- YAML 查看 -->
    <div v-if="selected" class="card p-4">
      <div class="flex items-center justify-between mb-2">
        <h2 class="font-semibold text-sm">{{ selected.domain }}</h2>
        <button class="btn-ghost !h-7 !px-2.5 text-xs" @click="selected = null">关闭</button>
      </div>
      <pre class="bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 p-3 rounded-md text-xs overflow-x-auto text-gray-700 dark:text-slate-300">{{ selected.content }}</pre>
    </div>
  </div>
</template>
