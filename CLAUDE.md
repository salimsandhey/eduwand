# Project conventions

## unified-app (React Native / Expo) - layout, system bars, keyboard

The Android app is edge-to-edge: content draws under the status bar and the
navigation bar (gesture bar, 3-button nav) and the window does NOT resize for
the keyboard. Never hard-code offsets like `paddingBottom: 132`, `marginBottom: 16`
to "clear" the nav bar / tab bar / keyboard - they break on other devices. Use
these instead; every one of them reads live insets or live measurements.

**Screens (pushed on the root stack)**
- Wrap in `<Screen edges={...}>` ([Screen.tsx](unified-app/src/components/Screen.tsx)).
  Custom header (`headerShown: false`) -> `["top", "bottom"]`. Native header -> `["bottom"]`.
  Never leave a stack screen on the default `["top"]` if it has content near the bottom.

**Tab screens (inside the floating tab bar)**
- Scroll content bottom padding = `useTabBarClearance()` from
  [useTabBarClearance.ts](unified-app/src/navigation/useTabBarClearance.ts). Use `useTabBarTop(gap)` for
  something pinned just above the bar (e.g. a composer).

**Bottom sheets / modals**
- Use `<SheetModal>` ([SheetModal.tsx](unified-app/src/components/SheetModal.tsx)) for any bottom sheet.
  Do not write a raw `<Modal>` + `KeyboardAvoidingView` sheet. A raw React Native `<Modal>` is a
  separate native window that ignores safe areas and the keyboard. If a custom modal is truly
  needed, it must set `statusBarTranslucent navigationBarTranslucent`, add `useSafeAreaInsets().bottom`,
  and lift with `useKeyboardOverlap()` - see `SheetModal` / `AiAssistChatModal`.
- Centered dialogs/alerts (ConfirmModal, pickers) are fine as plain modals as long as they never sit at the screen edge.

**Keyboard**
- Do NOT use `KeyboardAvoidingView` or a raw keyboard height. Use `useKeyboardOverlap()`
  ([useKeyboardOverlap.ts](unified-app/src/hooks/useKeyboardOverlap.ts)): attach `ref`/`onLayout` to the
  full-height container and add `overlap` as its bottom padding while `keyboardVisible`. It measures
  what the keyboard actually covers, so it is right whether or not the OS already resized the window.

**Chat / message lists**
- Use an `inverted` FlatList (newest first) so the latest message stays pinned to the bottom. Do not
  rely on `scrollToEnd` timing.

**Titles**
- A screen shows its title once. If you hide the native header, render the title in the screen's own
  top bar; do not repeat it as a page heading under a native header.

Before finishing any new screen or modal, check it with Android 3-button navigation AND gesture
navigation, and with the keyboard open.
