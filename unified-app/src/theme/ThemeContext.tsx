import { createContext, useContext, ReactNode } from "react";
import { useColorScheme } from "react-native";
import { darkColors, lightColors, ThemeColors, getCardShadow, PRESSED_OPACITY } from "./tokens";

interface ThemeContextValue {
  colors: ThemeColors;
  mode: "light" | "dark";
  cardShadow: ReturnType<typeof getCardShadow>;
  pressedOpacity: number;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const mode: "light" | "dark" = scheme === "light" ? "light" : "dark";
  const colors = mode === "dark" ? darkColors : lightColors;

  return (
    <ThemeContext.Provider value={{ colors, mode, cardShadow: getCardShadow(mode), pressedOpacity: PRESSED_OPACITY }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
