import { createContext, ReactNode, useCallback, useContext, useMemo, useRef } from "react";
import { Animated, NativeScrollEvent, NativeSyntheticEvent } from "react-native";

// Drives the floating tab bar's scroll-aware shrink/expand (FloatingTabBar.tsx):
// screens opt in by wiring useTabBarScrollHandler() into a ScrollView/FlatList's
// onScroll, and the tab bar reads the shared scale via useTabBarScale(). Scoped
// per-navigator (wrap one Tab.Navigator in <TabBarScrollProvider>) so enabling
// this for one role's tabs (e.g. enrolment) never touches another's.
interface TabBarScrollContextValue {
  scale: Animated.Value;
  handleScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  resetToExpanded: () => void;
}

const TabBarScrollContext = createContext<TabBarScrollContextValue | null>(null);

const EXPANDED_SCALE = 1;
const COLLAPSED_SCALE = 0.84;
// Total distance that must accumulate in one consistent direction before the
// bar reacts - accumulated across events, not judged per-event, so a slow
// drag (many small deltas) crosses this just as reliably as a fast flick (one
// big delta). Any reversal resets the accumulator.
const DIRECTION_THRESHOLD = 12;
// Below this offset the bar always shows full-size regardless of the last
// scroll direction, so it's never left shrunk while resting at the top.
const TOP_SNAP_OFFSET = 4;

export function TabBarScrollProvider({ children }: { children: ReactNode }) {
  const scale = useRef(new Animated.Value(EXPANDED_SCALE)).current;
  const lastOffsetY = useRef(0);
  const currentTarget = useRef(EXPANDED_SCALE);
  // Distance accumulated so far in accumDirection since it was last reset (by
  // a direction reversal, hitting the threshold, or snapping to the top).
  const accumDirection = useRef<"up" | "down" | null>(null);
  const accumDistance = useRef(0);
  // Set after a reset (e.g. switching tabs) so the next scroll event just
  // records its offset as the new baseline instead of computing a delta
  // against a stale offset left over from whichever screen was scrolled
  // before - that stale baseline could otherwise belong to a completely
  // different screen's scroll position and produce a bogus huge delta.
  const needsBaseline = useRef(false);

  const animateTo = useCallback(
    (target: number) => {
      if (currentTarget.current === target) return;
      currentTarget.current = target;
      Animated.spring(scale, { toValue: target, useNativeDriver: true, tension: 260, friction: 22 }).start();
    },
    [scale]
  );

  // Called when the active tab changes, so a bar left shrunk from scrolling
  // on the previous screen doesn't carry that shrunk state into the newly
  // focused one - every screen always starts at full size.
  const resetToExpanded = useCallback(() => {
    accumDirection.current = null;
    accumDistance.current = 0;
    needsBaseline.current = true;
    animateTo(EXPANDED_SCALE);
  }, [animateTo]);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      // Clamp out iOS's negative overscroll bounce so it can't register as an
      // upward scroll past the top.
      const offsetY = Math.max(0, event.nativeEvent.contentOffset.y);

      if (needsBaseline.current) {
        needsBaseline.current = false;
        lastOffsetY.current = offsetY;
        return;
      }

      const delta = offsetY - lastOffsetY.current;
      lastOffsetY.current = offsetY;

      if (offsetY <= TOP_SNAP_OFFSET) {
        accumDirection.current = null;
        accumDistance.current = 0;
        animateTo(EXPANDED_SCALE);
        return;
      }

      if (delta === 0) return;
      const direction = delta > 0 ? "down" : "up";

      // A reversal starts the accumulator over from this event's own delta,
      // rather than from zero, so a change of direction doesn't need an
      // extra "free" event before it starts counting.
      accumDistance.current = direction === accumDirection.current ? accumDistance.current + Math.abs(delta) : Math.abs(delta);
      accumDirection.current = direction;

      if (accumDistance.current > DIRECTION_THRESHOLD) {
        animateTo(direction === "down" ? COLLAPSED_SCALE : EXPANDED_SCALE);
      }
    },
    [animateTo]
  );

  const value = useMemo(() => ({ scale, handleScroll, resetToExpanded }), [scale, handleScroll, resetToExpanded]);

  return <TabBarScrollContext.Provider value={value}>{children}</TabBarScrollContext.Provider>;
}

// Returns null when no ancestor TabBarScrollProvider exists, so FloatingTabBar
// can fall back to a fixed, unanimated scale on tab navigators that haven't
// opted into this behaviour.
export function useTabBarScale(): Animated.Value | null {
  const ctx = useContext(TabBarScrollContext);
  return ctx?.scale ?? null;
}

// Returns undefined outside a TabBarScrollProvider, which is a valid no-op
// value for a ScrollView/FlatList's onScroll prop.
export function useTabBarScrollHandler(): ((event: NativeSyntheticEvent<NativeScrollEvent>) => void) | undefined {
  const ctx = useContext(TabBarScrollContext);
  return ctx?.handleScroll;
}

// Returns undefined outside a TabBarScrollProvider, matching the other hooks
// above - FloatingTabBar calls this (if present) whenever the focused tab
// changes.
export function useTabBarScrollReset(): (() => void) | undefined {
  const ctx = useContext(TabBarScrollContext);
  return ctx?.resetToExpanded;
}
