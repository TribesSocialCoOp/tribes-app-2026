'use client';

import { useEffect, useState, useCallback } from 'react';

type Theme = 'light' | 'dark' | 'system';

/**
 * Hook to manage dark/light theme.
 * - Reads from localStorage on mount
 * - Falls back to OS preference (prefers-color-scheme)
 * - Applies .dark class to <html> element
 * - Persists choice to localStorage
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('system');
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');

  // Resolve the actual theme (system → light/dark)
  const resolve = useCallback((t: Theme): 'light' | 'dark' => {
    if (t === 'system') {
      return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
    }
    return t;
  }, []);

  // Apply theme to DOM
  const applyTheme = useCallback((resolved: 'light' | 'dark') => {
    if (typeof document === 'undefined') return;
    document.documentElement.classList.toggle('dark', resolved === 'dark');
    setResolvedTheme(resolved);
  }, []);

  // Initialize on mount
  useEffect(() => {
    const stored = localStorage.getItem('tribes-theme') as Theme | null;
    const initial = stored ?? 'system';
    setThemeState(initial);
    applyTheme(resolve(initial));

    // Listen for OS theme changes when set to 'system'
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      const current = (localStorage.getItem('tribes-theme') as Theme | null) ?? 'system';
      if (current === 'system') {
        applyTheme(resolve('system'));
      }
    };
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [resolve, applyTheme]);

  const setTheme = useCallback((t: Theme) => {
    localStorage.setItem('tribes-theme', t);
    setThemeState(t);
    applyTheme(resolve(t));
  }, [resolve, applyTheme]);

  const toggle = useCallback(() => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  }, [resolvedTheme, setTheme]);

  return {
    theme,          // 'light' | 'dark' | 'system'
    resolvedTheme,  // 'light' | 'dark' (actual applied theme)
    setTheme,
    toggle,
    isDark: resolvedTheme === 'dark',
  };
}
