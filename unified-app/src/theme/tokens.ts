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
  accentOn: string;
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

export function getCardShadow(mode: "light" | "dark") {
  if (mode === "dark") {
    return {
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.14,
      shadowRadius: 8,
      elevation: 2,
    };
  }
  return {
    shadowColor: "#1F1F1F",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.045,
    shadowRadius: 8,
    elevation: 1,
  };
}

export const PRESSED_OPACITY = 0.65;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };

export const lightColors: ThemeColors = {
  background: "#FFFFFF",
  backgroundMuted: "#F7F5F1",
  surface: "#FFFFFF",
  surfaceRaised: "#FCFBF8",
  surfaceAccent: "#F8EEF5",
  border: "#E8E2D9",
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
