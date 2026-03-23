import { useState } from 'react';
import { ChevronDown, Palette } from 'lucide-react';
import type { ThemeName } from '../lib/types/designTokenTypes';
import { getAllThemes } from '../lib/designTokens';

interface Va2ThemeSwitcherProps {
  currentTheme: ThemeName;
  onThemeChange: (theme: ThemeName) => void;
  isAssembling?: boolean;
}

export function Va2ThemeSwitcher({
  currentTheme,
  onThemeChange,
  isAssembling,
}: Va2ThemeSwitcherProps) {
  const [open, setOpen] = useState(false);
  const themes = getAllThemes();
  const current = themes.find((t) => t.name === currentTheme);

  return (
    <span className="relative">
      <button
        type="button"
        disabled={isAssembling}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium bg-white/[0.06] hover:bg-white/[0.12] text-slate-300 disabled:opacity-40 transition-colors"
      >
        <Palette className="w-3 h-3" />
        {current?.label ?? currentTheme}
        <ChevronDown className="w-3 h-3 opacity-50" />
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-1 w-48 rounded-lg border border-white/10 bg-[#141720] shadow-xl py-1 max-h-64 overflow-y-auto">
            {themes.map((theme) => {
              const isActive = theme.name === currentTheme;
              return (
                <button
                  key={theme.name}
                  type="button"
                  onClick={() => {
                    onThemeChange(theme.name);
                    setOpen(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 text-[12px] flex items-center gap-2 transition-colors ${
                    isActive
                      ? 'bg-primary-500/20 text-primary-300'
                      : 'text-slate-300 hover:bg-white/[0.06]'
                  }`}
                >
                  {isActive ? (
                    <span className="w-1.5 h-1.5 rounded-full bg-primary-400" />
                  ) : (
                    <span className="w-1.5 h-1.5" />
                  )}
                  <span>
                    <span className="font-medium">{theme.label}</span>
                    <span className="block text-[10px] text-slate-500 mt-0.5">{theme.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </>
      ) : null}
    </span>
  );
}
