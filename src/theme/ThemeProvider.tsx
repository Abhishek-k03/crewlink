import { type ReactNode, useCallback, useMemo, useState } from 'react';

import { type Theme, THEME_KEY, ThemeContext } from './context';

// Reads the class already set by the bootstrap script in index.html, so
// React's idea of the theme matches what's actually painted.
function currentTheme(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(currentTheme);

  const toggleTheme = useCallback(() => {
    setTheme((previous) => {
      const next: Theme = previous === 'dark' ? 'light' : 'dark';
      document.documentElement.classList.toggle('dark', next === 'dark');
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch {
        // Preference is lost on reload, but the toggle still works this session.
      }
      return next;
    });
  }, []);

  const value = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
