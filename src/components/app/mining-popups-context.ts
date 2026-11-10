import { createContext, useContext } from "react";

export type MiningPopupKind = "away" | "extension";

export type MiningPopupsContextValue = {
  openMiningPopup: (kind: MiningPopupKind) => void;
};

export const MiningPopupsContext =
  createContext<MiningPopupsContextValue | null>(null);

export function useMiningPopups() {
  const value = useContext(MiningPopupsContext);
  if (!value) {
    throw new Error("useMiningPopups must be used inside MiningPopupsProvider.");
  }
  return value;
}
