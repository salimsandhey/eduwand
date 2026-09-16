import { createContext, useContext, ReactNode } from "react";
import { lightColors, ThemeColors, getCardShadow, PRESSED_OPACITY } from "./tokens";

interface ThemeContextValue {
  colors: ThemeColors;
  mode: "light" | "dark";
  cardShadow: ReturnType<typeof getCardShadow>;
  pressedOpacity: number;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

// This app only ships a light theme - deliberately not reading the device's
// system color scheme (useColorScheme), which used to flip the whole app to
// darkColors whenever the phone was in system dark mode (or even briefly
// reported an unsettled null scheme on startup).
export function ThemeProvider({ children }: { children: ReactNode }) {
  const mode: "light" | "dark" = "light";
  const colors = lightColors;

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
