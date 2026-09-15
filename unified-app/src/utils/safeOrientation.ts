import * as ScreenOrientation from "expo-screen-orientation";

// expo-screen-orientation's native module can throw *synchronously* (e.g.
// "Cannot find native module 'ExpoScreenOrientation'") when the JS package
// was installed but the app hasn't been rebuilt natively yet with it linked -
// a plain `.catch()` on the returned promise does nothing against a
// synchronous throw, since the throw happens before any promise exists to
// attach `.catch()` to. Both callers wrap every call through here instead of
// calling the module directly, so a stale/un-rebuilt native binary degrades
// to "orientation locking silently does nothing" instead of crashing.
function safeLock(orientation: ScreenOrientation.OrientationLock) {
  try {
    ScreenOrientation.lockAsync(orientation).catch(() => {});
  } catch {
    // Native module not linked in this build - no-op.
  }
}

export function lockLandscape() {
  safeLock(ScreenOrientation.OrientationLock.LANDSCAPE);
}

export function lockPortrait() {
  safeLock(ScreenOrientation.OrientationLock.PORTRAIT_UP);
}
