export interface ThemeColors {
  background: string;
  backgroundMuted: string;
  surface: string;
  surfaceRaised: string;
  surfaceAccent: string;
  border: string;
  accent: string;
  accentDark: string;
  accentSoft: string;
  accentSoftAlt: string;
  accentOn: string; // text/icon color on top of a solid accent fill
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  danger: string;
  warning: string;
}

export const darkColors: ThemeColors = {
  background: "#090909",
  backgroundMuted: "#141414",
  surface: "#111111",
  surfaceRaised: "#171717",
  surfaceAccent: "#1C1C1C",
  border: "#2A2A2A",
  accent: "#7B2D2B",
  accentDark: "#541C1B",
  accentSoft: "#1A1010",
  accentSoftAlt: "#2A1717",
  accentOn: "#FFFFFF",
  textPrimary: "#FFFFFF",
  textSecondary: "#D7D7D7",
  textMuted: "#9E9E9E",
  danger: "#D85A5A",
  warning: "#C98732",
};

// Cards read as flat/pasted-on without some depth cue. Dark surfaces barely show a
// black shadow, so dark mode leans on a faint light-colored glow instead; light mode
// uses a conventional soft drop shadow. Both keep elevation for Android parity.
export function getCardShadow(mode: "light" | "dark") {
  if (mode === "dark") {
    return {
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.28,
      shadowRadius: 18,
      elevation: 8,
    };
  }
  return {
    shadowColor: "#4A201E",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 6,
  };
}

export const PRESSED_OPACITY = 0.65;

export const lightColors: ThemeColors = {
  background: "#FFFFFF",
  backgroundMuted: "#F7F7F7",
  surface: "#FFFFFF",
  surfaceRaised: "#F8F8F8",
  surfaceAccent: "#F2F2F2",
  border: "#E8E8E8",
  accent: "#7B2D2B",
  accentDark: "#5D201F",
  accentSoft: "#FAF1F1",
  accentSoftAlt: "#F3E3E3",
  accentOn: "#FFFFFF",
  textPrimary: "#121212",
  textSecondary: "#343434",
  textMuted: "#767676",
  danger: "#A63F35",
  warning: "#A7722E",
};
