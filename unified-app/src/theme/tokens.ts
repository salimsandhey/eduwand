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

export const brandPalette = {
  deepPlum: "#7C005A",
  amber: "#FBAA0A",
  ivory: "#F4F1E8",
  coral: "#FB5F7E",
  charcoal: "#1F1F1F",
  teal: "#52DFD6",
  white: "#FFFFFF",
};

export const typography = {
  fontFamily: "Poppins-Regular",
  medium: "Poppins-Medium",
  semiBold: "Poppins-SemiBold",
  bold: "Poppins-Bold",
};

export const darkColors: ThemeColors = {
  background: "#1F1F1F",
  backgroundMuted: "#282828",
  surface: "#252525",
  surfaceRaised: "#303030",
  surfaceAccent: "#3A2A35",
  border: "#3C3C3C",
  accent: "#FBAA0A",
  accentDark: "#D28A00",
  accentSoft: "#3A2B12",
  accentSoftAlt: "#503A12",
  accentOn: "#FFFFFF",
  textPrimary: "#FFFFFF",
  textSecondary: "#F4F1E8",
  textMuted: "#BDB7AC",
  danger: "#FB5F7E",
  warning: "#FBAA0A",
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
    shadowColor: "#7C005A",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.13,
    shadowRadius: 20,
    elevation: 6,
  };
}

export const PRESSED_OPACITY = 0.65;

// No shared spacing/radius scale existed before this - every screen picked
// its own numbers for "card padding"/"card radius", which is why the same
// visual concept (a card, a list row) looked different screen to screen.
// radius.lg (16) and spacing.lg (16) are the standard for card/row
// containers; spacing.md/sm/xs cover internal gaps and margins.
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };

export const lightColors: ThemeColors = {
  background: "#F4F1E8",
  backgroundMuted: "#ECE7DB",
  surface: "#FFFFFF",
  surfaceRaised: "#FAF8F1",
  surfaceAccent: "#F4F1E8",
  border: "#E4DED0",
  accent: "#7C005A",
  accentDark: "#5B0042",
  accentSoft: "#F7E6F2",
  accentSoftAlt: "#E9C9DE",
  accentOn: "#FFFFFF",
  textPrimary: "#1F1F1F",
  textSecondary: "#3A3437",
  textMuted: "#756C72",
  danger: "#FB5F7E",
  warning: "#FBAA0A",
};
