import { useEffect, useState } from "react";

import {
  DisplayPreferencesContext,
  type ThemePreference,
} from "./displayPreferences";

const THEME_KEY = "passagen.theme";
const READER_FONT_SIZE_KEY = "passagen.reader-font-size";
const DEFAULT_READER_FONT_SIZE = 17;
const MIN_READER_FONT_SIZE = 14;
const MAX_READER_FONT_SIZE = 24;
const themes: ThemePreference[] = ["system", "light", "dark"];

function storedValue<T extends string>(key: string, choices: T[], fallback: T): T {
  try {
    const value = window.localStorage.getItem(key);
    return choices.includes(value as T) ? value as T : fallback;
  } catch {
    return fallback;
  }
}

function storedReaderFontSize(): number {
  try {
    const value = Number(window.localStorage.getItem(READER_FONT_SIZE_KEY));
    return Number.isInteger(value) && value >= MIN_READER_FONT_SIZE && value <= MAX_READER_FONT_SIZE
      ? value
      : DEFAULT_READER_FONT_SIZE;
  } catch {
    return DEFAULT_READER_FONT_SIZE;
  }
}

export function DisplayPreferencesProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<ThemePreference>(() =>
    storedValue(THEME_KEY, themes, "system"),
  );
  const [readerFontSize, setReaderFontSize] = useState(storedReaderFontSize);

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      const resolved = theme === "system" ? (media?.matches ? "dark" : "light") : theme;
      document.documentElement.dataset.theme = resolved;
      document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute(
        "content",
        resolved === "dark" ? "#171814" : "#f1ede2",
      );
    };

    try {
      window.localStorage.setItem(THEME_KEY, theme);
    } catch {
      // The preference remains active for this session when storage is unavailable.
    }
    applyTheme();
    if (theme !== "system") return;
    media?.addEventListener("change", applyTheme);
    return () => media?.removeEventListener("change", applyTheme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.style.setProperty("--reader-font-size", `${readerFontSize}px`);
    document.documentElement.dataset.readerScale = readerFontSize >= 21 ? "large" : "standard";
    try {
      window.localStorage.setItem(READER_FONT_SIZE_KEY, String(readerFontSize));
    } catch {
      // The preference remains active for this session when storage is unavailable.
    }
  }, [readerFontSize]);

  return (
    <DisplayPreferencesContext value={{ theme, setTheme, readerFontSize, setReaderFontSize }}>
      {children}
    </DisplayPreferencesContext>
  );
}
