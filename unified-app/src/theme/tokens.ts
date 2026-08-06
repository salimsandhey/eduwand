export interface ThemeColors {
  background: string;
  surface: string;
  surfaceRaised: string;
  border: string;
  accent: string;
  accentDark: string;
  accentOn: string; // text/icon color on top of a solid accent fill
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  danger: string;
  warning: string;
}

export const darkColors: ThemeColors = {
  background: "#0B0F0D",
  surface: "#141B17",
  surfaceRaised: "#1B231E",
  border: "#232B26",
  accent: "#17C964",
  accentDark: "#0FA855",
  accentOn: "#04170D",
  textPrimary: "#F5F7F6",
  textSecondary: "#A8B3AD",
  textMuted: "#6B756F",
  danger: "#F31260",
  warning: "#F5A524",
};

// Cards read as flat/pasted-on without some depth cue. Dark surfaces barely show a
// black shadow, so dark mode leans on a faint light-colored glow instead; light mode
// uses a conventional soft drop shadow. Both keep elevation for Android parity.
export function getCardShadow(mode: "light" | "dark") {
  if (mode === "dark") {
    return {
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.4,
      shadowRadius: 3,
      elevation: 2,
    };
  }
  return {
    shadowColor: "#0B1F14",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 2,
  };
}

export const PRESSED_OPACITY = 0.65;

export const lightColors: ThemeColors = {
  background: "#F5F7F4",
  surface: "#FFFFFF",
  surfaceRaised: "#F0F2EF",
  border: "#E1E6DE",
  accent: "#1F9D55",
  accentDark: "#17803F",
  accentOn: "#FFFFFF",
  textPrimary: "#131A15",
  textSecondary: "#4B564D",
  textMuted: "#8A948B",
  danger: "#C0392B",
  warning: "#B7791F",
};
