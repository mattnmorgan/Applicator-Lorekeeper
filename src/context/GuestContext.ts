import { createContext, useContext } from "react";

interface GuestContextValue {
  isGuest: boolean;
  guestHeaders: Record<string, string>;
}

const defaultValue: GuestContextValue = { isGuest: false, guestHeaders: {} };

export const GuestContext = createContext<GuestContextValue>(defaultValue);

export function useGuest(): GuestContextValue {
  return useContext(GuestContext);
}
