import { createContext, useContext, ReactNode } from "react";
import { useColorScheme } from "react-native";
import { darkColors, lightColors, ThemeColors } from "./tokens";

interface ThemeContextValue {
  colors: ThemeColors;
  mode: "light" | "dark";
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const mode: "light" | "dark" = scheme === "light" ? "light" : "dark";
  const colors = mode === "dark" ? darkColors : lightColors;

  return <ThemeContext.Provider value={{ colors, mode }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
