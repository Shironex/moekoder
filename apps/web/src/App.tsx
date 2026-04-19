import { useState } from 'react';
import { THEMES, DEFAULT_THEME_ID, APP_NAME, APP_SIGIL, APP_EDITION, type ThemeId } from '@moekoder/shared';

export function App() {
  const [themeId, setThemeId] = useState<ThemeId>(DEFAULT_THEME_ID);

  const applyTheme = (id: ThemeId) => {
    setThemeId(id);
    document.documentElement.setAttribute('data-theme', id);
  };

  return (
    <div className="app-root">
      <header className="titlebar">
        <div className="brand">
          <span className="k">{APP_SIGIL}</span>
          <span>{APP_NAME}</span>
          <span className="brand-sub">{APP_EDITION}</span>
        </div>
        <div className="spacer" />
        <div className="themes">
          {THEMES.map((t) => (
            <button
              key={t.id}
              className={t.id === themeId ? 'active' : ''}
              onClick={() => applyTheme(t.id)}
            >
              {t.kanji} {t.name}
            </button>
          ))}
        </div>
      </header>
      <main>phase 1 scaffold — ffmpeg integration in later phases.</main>
    </div>
  );
}
