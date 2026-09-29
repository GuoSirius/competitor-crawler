// 主题状态：默认暗黑；用户切换后持久化到 localStorage
export function useTheme() {
  const isDark = useState('theme-dark', () => true);

  if (import.meta.client) {
    watch(isDark, (v) => {
      document.documentElement.classList.toggle('dark', v);
      try {
        localStorage.setItem('cc-theme', v ? 'dark' : 'light');
      } catch {
        /* 忽略隐私模式存储失败 */
      }
    });
  }

  function toggle() {
    isDark.value = !isDark.value;
  }
  return { isDark, toggle };
}
