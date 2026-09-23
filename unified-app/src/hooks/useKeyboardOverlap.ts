import { useCallback, useEffect, useRef, useState } from "react";
import { Keyboard, Platform, View } from "react-native";

/**
 * How many pixels of the attached container the on-screen keyboard is
 * currently covering - measured, not assumed.
 *
 * Attach `ref`/`onLayout` to the full-height container whose bottom edge is
 * the screen bottom, and add `overlap` as its bottom padding while
 * `keyboardVisible` is true. Because the overlap is computed from the
 * container's real window position and the keyboard's real top edge, it is
 * correct whether or not the OS already resized the window (Android
 * adjustResize vs edge-to-edge, iOS home-indicator inset, split-screen,
 * floating/tall keyboards) - it collapses to 0 when nothing is covered, so
 * there is never a double offset.
 */
export function useKeyboardOverlap() {
  const ref = useRef<View>(null);
  const keyboardTop = useRef<number | null>(null);
  const [overlap, setOverlap] = useState(0);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  const recompute = useCallback(() => {
    const top = keyboardTop.current;
    if (top === null) {
      setOverlap(0);
      return;
    }
    ref.current?.measureInWindow((_x, y, _w, height) => {
      setOverlap(Math.max(0, Math.round(y + height - top)));
    });
  }, []);

  useEffect(() => {
    const ios = Platform.OS === "ios";
    const subs = [
      Keyboard.addListener(ios ? "keyboardWillShow" : "keyboardDidShow", (e) => {
        keyboardTop.current = e.endCoordinates.screenY;
        setKeyboardVisible(true);
        recompute();
      }),
      Keyboard.addListener(ios ? "keyboardWillHide" : "keyboardDidHide", () => {
        keyboardTop.current = null;
        setKeyboardVisible(false);
        setOverlap(0);
      }),
    ];
    // Keyboard switched (emoji/suggestion bar) or resized while open.
    if (ios) {
      subs.push(
        Keyboard.addListener("keyboardWillChangeFrame", (e) => {
          if (keyboardTop.current === null) return;
          keyboardTop.current = e.endCoordinates.screenY;
          recompute();
        })
      );
    }
    return () => subs.forEach((s) => s.remove());
  }, [recompute]);

  // Layout changes (window resized by the OS after the keyboard event,
  // rotation) re-measure against the last known keyboard position.
  return { ref, onLayout: recompute, overlap, keyboardVisible };
}
