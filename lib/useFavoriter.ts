"use client";

import { useEffect, useState, useCallback } from "react";
import { Annons } from "./types";

const NYCKEL = "begagnat-favoriter";

/**
 * Hanterar sparade favoritannonser. Sparas i webbläsarens localStorage
 * så de finns kvar mellan besök (per webbläsare, ingen databas behövs).
 */
export function useFavoriter() {
  const [favoriter, setFavoriter] = useState<Annons[]>([]);
  const [laddad, setLaddad] = useState(false);

  // Läs in sparade favoriter vid start
  useEffect(() => {
    try {
      const rad = localStorage.getItem(NYCKEL);
      if (rad) setFavoriter(JSON.parse(rad));
    } catch {
      // trasig data – ignorera
    }
    setLaddad(true);
  }, []);

  // Spara till localStorage varje gång listan ändras (efter första inläsningen)
  useEffect(() => {
    if (!laddad) return;
    try {
      localStorage.setItem(NYCKEL, JSON.stringify(favoriter));
    } catch {
      // t.ex. fullt lagringsutrymme – ignorera
    }
  }, [favoriter, laddad]);

  const arFavorit = useCallback(
    (id: string) => favoriter.some((f) => f.id === id),
    [favoriter]
  );

  const toggleFavorit = useCallback((annons: Annons) => {
    setFavoriter((prev) =>
      prev.some((f) => f.id === annons.id)
        ? prev.filter((f) => f.id !== annons.id)
        : [annons, ...prev]
    );
  }, []);

  return { favoriter, arFavorit, toggleFavorit };
}
