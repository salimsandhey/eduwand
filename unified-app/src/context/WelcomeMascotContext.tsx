import React, { createContext, useContext, useState, useCallback, useMemo } from "react";

interface WelcomeMascotContextValue {
  isWelcomeActive: boolean;
  isFlying: boolean;
  isMascotDocked: boolean;
  // True once the welcome reaches its final beat - intro and flight to the
  // dock done, and the post-dock spotlight has STARTED its exit (tag
  // dropping, dim fading). Anything that wants to appear "as the cat
  // finishes" should wait on this, not on isWelcomeActive.
  isWelcomeSequenceComplete: boolean;
  finishWelcomeSequence: () => void;
  welcomeCount: number;
  dockCoordinates: { x: number; y: number } | null;
  setDockCoordinates: (coords: { x: number; y: number }) => void;
  startWelcome: () => void;
  startFlight: () => void;
  completeWelcome: () => void;
  setMascotDocked: (docked: boolean) => void;
  resetWelcome: () => void;
}

const WelcomeMascotContext = createContext<WelcomeMascotContextValue | undefined>(undefined);

export function WelcomeMascotProvider({ children }: { children: React.ReactNode }) {
  // Off until App.tsx's Root() explicitly calls startWelcome() for a
  // genuinely new registration (see hasSeenMascotWelcome) - this used to
  // default true "for testing", which is what made the animation replay on
  // every app load/refresh for every account.
  const [isWelcomeActive, setIsWelcomeActive] = useState<boolean>(false);
  const [isFlying, setIsFlying] = useState<boolean>(false);
  // Purely an animation-sequencing flag (did the fly-in land yet) - NOT what
  // gates the AI nav-bar button's visibility (see FloatingTabBar, which
  // renders the button unconditionally now; it used to wait on this, which
  // is what hid the button entirely for a returning teacher who never plays
  // startWelcome()).
  const [isMascotDocked, setIsMascotDocked] = useState<boolean>(false);
  const [isWelcomeSequenceComplete, setIsWelcomeSequenceComplete] = useState<boolean>(false);
  const [welcomeCount, setWelcomeCount] = useState<number>(1);
  const [dockCoordinates, setDockCoordinates] = useState<{ x: number; y: number } | null>(null);

  const startWelcome = useCallback(() => {
    setIsMascotDocked(false);
    setIsFlying(false);
    setIsWelcomeSequenceComplete(false);
    setIsWelcomeActive(true);
    setWelcomeCount((c) => c + 1);
  }, []);

  const finishWelcomeSequence = useCallback(() => {
    setIsWelcomeSequenceComplete(true);
  }, []);

  const startFlight = useCallback(() => {
    setIsWelcomeActive(false);
    setIsFlying(true);
  }, []);

  const completeWelcome = useCallback(() => {
    setIsWelcomeActive(false);
    setIsFlying(false);
    setIsMascotDocked(true);
  }, []);

  const resetWelcome = useCallback(() => {
    startWelcome();
  }, [startWelcome]);

  const value = useMemo(
    () => ({
      isWelcomeActive,
      isFlying,
      isMascotDocked,
      isWelcomeSequenceComplete,
      finishWelcomeSequence,
      welcomeCount,
      dockCoordinates,
      setDockCoordinates,
      startWelcome,
      startFlight,
      completeWelcome,
      setMascotDocked: setIsMascotDocked,
      resetWelcome,
    }),
    [isWelcomeActive, isFlying, isMascotDocked, isWelcomeSequenceComplete, finishWelcomeSequence, welcomeCount, dockCoordinates, startWelcome, startFlight, completeWelcome, resetWelcome]
  );

  return (
    <WelcomeMascotContext.Provider value={value}>
      {children}
    </WelcomeMascotContext.Provider>
  );
}

const DEFAULT_VALUE: WelcomeMascotContextValue = {
  isWelcomeActive: false,
  isFlying: false,
  isMascotDocked: false,
  isWelcomeSequenceComplete: false,
  finishWelcomeSequence: () => {},
  welcomeCount: 1,
  dockCoordinates: null,
  setDockCoordinates: () => {},
  startWelcome: () => {},
  startFlight: () => {},
  completeWelcome: () => {},
  setMascotDocked: () => {},
  resetWelcome: () => {},
};

export function useWelcomeMascot(): WelcomeMascotContextValue {
  const context = useContext(WelcomeMascotContext);
  return context ?? DEFAULT_VALUE;
}
