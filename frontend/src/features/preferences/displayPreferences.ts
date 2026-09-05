import { createContext, useContext } from "react";

export type ThemePreference = "system" | "light" | "dark";

export interface DisplayPreferences {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
  readerFontSize: number;
  setReaderFontSize: (size: number) => void;
}

export const DisplayPreferencesContext = createContext<DisplayPreferences | null>(null);

export function useDisplayPreferences() {
  const preferences = useContext(DisplayPreferencesContext);
  if (!preferences) throw new Error("Display preferences provider is missing");
  return preferences;
}
