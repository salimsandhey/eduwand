import React, { createContext, useContext, useState, useCallback, useMemo } from "react";

interface WelcomeMascotContextValue {
  isWelcomeActive: boolean;
  isFlying: boolean;
  isMascotDocked: boolean;
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
  // Always active on every app load / refresh for testing
  const [isWelcomeActive, setIsWelcomeActive] = useState<boolean>(true);
  const [isFlying, setIsFlying] = useState<boolean>(false);
  const [isMascotDocked, setIsMascotDocked] = useState<boolean>(false);
  const [welcomeCount, setWelcomeCount] = useState<number>(1);
  const [dockCoordinates, setDockCoordinates] = useState<{ x: number; y: number } | null>(null);

  const startWelcome = useCallback(() => {
    setIsMascotDocked(false);
    setIsFlying(false);
    setIsWelcomeActive(true);
    setWelcomeCount((c) => c + 1);
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
      welcomeCount,
      dockCoordinates,
      setDockCoordinates,
      startWelcome,
      startFlight,
      completeWelcome,
      setMascotDocked: setIsMascotDocked,
      resetWelcome,
    }),
    [isWelcomeActive, isFlying, isMascotDocked, welcomeCount, dockCoordinates, startWelcome, startFlight, completeWelcome, resetWelcome]
  );

  return (
    <WelcomeMascotContext.Provider value={value}>
      {children}
    </WelcomeMascotContext.Provider>
  );
}

const DEFAULT_VALUE: WelcomeMascotContextValue = {
  isWelcomeActive: true,
  isFlying: false,
  isMascotDocked: false,
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
