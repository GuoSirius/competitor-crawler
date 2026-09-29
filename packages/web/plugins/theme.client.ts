// 客户端最早的插件：把 localStorage 里保存的主题应用到 <html>，避免闪白
export default defineNuxtPlugin(() => {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem('cc-theme');
  } catch {
    /* 忽略 */
  }
  const isDark = useState('theme-dark', () => true);
  if (saved === 'light') isDark.value = false;
  document.documentElement.classList.toggle('dark', isDark.value);
});
