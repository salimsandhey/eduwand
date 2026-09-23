import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TAB_BAR_HEIGHT } from "./FloatingTabBar";

// Breathing room kept between the last piece of content and the top of the bar.
const TAB_BAR_CONTENT_GAP = 62;

/**
 * Bottom padding a tab screen's scroll content needs so nothing ends up under
 * the floating tab bar. The bar sits at max(insets.bottom, 10) (see
 * FloatingTabBar), so this follows the device's real bottom inset - gesture
 * navigation, 3-button navigation, or an iPhone home indicator - instead of a
 * fixed number. `extra` is per-screen additional spacing.
 */
export function useTabBarClearance(extra = 0): number {
  return useTabBarTop(TAB_BAR_CONTENT_GAP + extra);
}

/** Distance from the screen bottom to the top edge of the tab bar, plus `gap`. */
export function useTabBarTop(gap = 0): number {
  const insets = useSafeAreaInsets();
  return Math.max(insets.bottom, 10) + TAB_BAR_HEIGHT + gap;
}
