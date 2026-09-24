import { useCallback, useEffect, useRef, useState } from "react";
import { Keyboard, KeyboardEvent, Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface Options {
  /**
   * How far the container's bottom edge sits above the screen's bottom edge
   * while the keyboard is closed. 0 for a container that runs to the screen
   * bottom (the default); `insets.bottom` for one inside a
   * <Screen edges={[..., "bottom"]}>, which already stops above the
   * navigation bar.
   */
  bottomInset?: number;
}

/**
 * How many pixels of the attached container the on-screen keyboard is
 * currently covering.
 *
 * Attach `ref`/`onLayout` to the container that holds the content the
 * keyboard must not hide (e.g. a chat list + composer), and add `overlap` as
 * its bottom padding while `keyboardVisible` is true.
 *
 * Deliberately never compares a measured view position against the
 * keyboard's screen position. On Android those two live in different
 * coordinate systems depending on the device: measureInWindow drops the
 * status bar height unless React Native's edge-to-edge flag is on
 * (RootViewUtil.getViewportOffset), and the event's screenY comes from
 * getWindowVisibleDisplayFrame, which edge-to-edge windows don't reliably
 * shrink for the keyboard. Mixing them left the composer short by about a
 * status bar - half of it behind the keyboard. Instead:
 *
 *  - how much of the screen the keyboard covers, measured up from the bottom
 *    edge: iOS reports it directly; on Android the event height is the IME
 *    inset minus the navigation bar inset, so the bar is added back;
 *  - minus how far the container's bottom edge moved up when the keyboard
 *    opened (the OS resizing the window). That's a difference of two
 *    measurements in the same system, so the offset cancels out;
 *  - minus the container's own gap above the screen bottom (bottomInset).
 *
 * The result is right whether or not the OS resized the window, and 0 when
 * nothing is covered, so there's never a double offset.
 */
export function useKeyboardOverlap({ bottomInset = 0 }: Options = {}) {
  const ref = useRef<View>(null);
  const insets = useSafeAreaInsets();
  const [overlap, setOverlap] = useState(0);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  // Keyboard height measured up from the screen's bottom edge; null = closed.
  const keyboardCover = useRef<number | null>(null);
  // The container's bottom edge (in its own measurement system) with the
  // keyboard closed - the reference for spotting a window resize.
  const restingBottom = useRef<number | null>(null);
  const navigationBarInset = useRef(insets.bottom);
  navigationBarInset.current = insets.bottom;
  const gapBelow = useRef(bottomInset);
  gapBelow.current = bottomInset;

  const recompute = useCallback(() => {
    ref.current?.measureInWindow((_x, y, _w, height) => {
      if (height <= 0) return;
      const bottom = y + height;
      const cover = keyboardCover.current;
      if (cover === null) {
        // Keep the lowest edge seen: a window resize can land a moment
        // before the keyboard event, and recording that shrunk position as
        // "resting" would lift the content twice. (The app is portrait-locked,
        // so the resting bottom never legitimately moves up.)
        restingBottom.current = Math.max(restingBottom.current ?? bottom, bottom);
        setOverlap(0);
        return;
      }
      // Moved up = the OS already shrank the window for the keyboard.
      const resized = restingBottom.current === null ? 0 : Math.max(0, restingBottom.current - bottom);
      setOverlap(Math.max(0, Math.round(cover - resized - gapBelow.current)));
    });
  }, []);

  useEffect(() => {
    const ios = Platform.OS === "ios";
    const coverFrom = (e: KeyboardEvent) =>
      ios ? e.endCoordinates.height : e.endCoordinates.height + navigationBarInset.current;

    const subs = [
      // Android re-emits keyboardDidShow when the height changes while open
      // (emoji panel, suggestion bar), so this also covers resizes there.
      Keyboard.addListener(ios ? "keyboardWillShow" : "keyboardDidShow", (e) => {
        keyboardCover.current = coverFrom(e);
        setKeyboardVisible(true);
        recompute();
      }),
      Keyboard.addListener(ios ? "keyboardWillHide" : "keyboardDidHide", () => {
        keyboardCover.current = null;
        setKeyboardVisible(false);
        setOverlap(0);
      }),
    ];
    if (ios) {
      subs.push(
        Keyboard.addListener("keyboardWillChangeFrame", (e) => {
          if (keyboardCover.current === null) return;
          keyboardCover.current = coverFrom(e);
          recompute();
        })
      );
    }
    return () => subs.forEach((s) => s.remove());
  }, [recompute]);

  // Every layout change re-measures: with the keyboard closed it refreshes
  // the resting position (rotation, header changes); with it open it picks
  // up a window resize that lands after the keyboard event.
  return { ref, onLayout: recompute, overlap, keyboardVisible };
}
