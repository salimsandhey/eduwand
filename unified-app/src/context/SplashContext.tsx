import { createContext, ReactNode, useContext } from "react";

// Lets any screen know whether AnimatedSplashScreen has finished its exit
// animation yet - App.tsx mounts AppNavigator (and everything under it)
// immediately, in parallel with the splash overlay, so anything that opens
// itself automatically on mount (e.g. TeacherTourModal) needs this to avoid
// popping up while the splash is still on screen. Modal content renders in
// its own native layer, always on top, so it would otherwise show through
// the splash regardless of JS zIndex.
const SplashContext = createContext(false);

export function SplashDoneProvider({ done, children }: { done: boolean; children: ReactNode }) {
  return <SplashContext.Provider value={done}>{children}</SplashContext.Provider>;
}

export function useSplashDone(): boolean {
  return useContext(SplashContext);
}
