import { useState, useEffect } from 'react';

type Theme = 'light' | 'dark';
const STORAGE_KEY = 'kk-theme-v2';

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window !== 'undefined') {
      // Light is the default for everyone; the key was renamed so earlier saved choices start on light once.
      try {
        const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
        if (stored === 'dark' || stored === 'light') return stored;
      } catch { /* storage unavailable: fall back to light */ }
      return 'light';
    }
    return 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* ignore */ }
  }, [theme]);

  const toggleTheme = () => setThemeState(prev => prev === 'light' ? 'dark' : 'light');

  return { theme, toggleTheme };
}
