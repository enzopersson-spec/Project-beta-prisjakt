"use client";

import { useState, useRef, useMemo } from "react";
import Sidebar from "@/components/Sidebar";
import ResultsGrid from "@/components/ResultsGrid";
import ResultCard from "@/components/ResultCard";
import { SokResultat, Annons } from "@/lib/types";
import { relevantaKallor } from "@/lib/kallval";
import { useFavoriter } from "@/lib/useFavoriter";

type Kalla = Annons["kalla"];
type Status = "laddar" | "klar" | "fel";
const ALLA_KALLOR: Kalla[] = ["blocket", "tradera", "sellpy", "vinted", "wayke"];

export default function Startsida() {
  const [sokord, setSokord] = useState("");
  const [sokAktiv, setSokAktiv] = useState(false);
  const [visaFavoriter, setVisaFavoriter] = useState(false);

  const [autoLage, setAutoLage] = useState(true);
  const [valdaKallor, setValdaKallor] = useState<Set<Kalla>>(new Set(ALLA_KALLOR));
  const [aktivaKallor, setAktivaKallor] = useState<Set<Kalla>>(new Set(ALLA_KALLOR));

  // Per-källa: resultat, status och ev. fel (fylls på allteftersom källorna svarar)
  const [annonserPerKalla, setAnnonserPerKalla] = useState<Record<string, Annons[]>>({});
  const [korStatus, setKorStatus] = useState<Record<string, Status>>({});
  const [felPerKalla, setFelPerKalla] = useState<Record<string, string>>({});

  const [aktiveradKalla, setAktiveradKalla] = useState<Kalla | "alla">("alla");
  const [minPris, setMinPris] = useState(0);
  const [maxPris, setMaxPris] = useState(50000);
  const [sortering, setSortering] = useState<"pris-asc" | "pris-desc" | "relevans">("relevans");

  const { favoriter, arFavorit, toggleFavorit } = useFavoriter();

  // Räknare för att ignorera svar från gamla sökningar
  const sokId = useRef(0);

  function toggleKalla(k: Kalla) {
    setAutoLage(false);
    setValdaKallor((prev) => {
      const next = new Set(prev);
      if (next.has(k)) {
        if (next.size > 1) next.delete(k);
      } else {
        next.add(k);
      }
      return next;
    });
  }

  function hanteraSok(query: string) {
    const q = query.trim();
    if (q.length < 2) return;

    const kallor = autoLage ? relevantaKallor(q, ALLA_KALLOR) : Array.from(valdaKallor);
    const id = ++sokId.current;

    setSokord(q);
    setSokAktiv(true);
    setVisaFavoriter(false);
    setAktiveradKalla("alla");
    setAktivaKallor(new Set(kallor));
    setAnnonserPerKalla({});
    setFelPerKalla({});
    setKorStatus(Object.fromEntries(kallor.map((k) => [k, "laddar"])));

    // Skjut iväg en sökning per källa – resultaten strömmar in var för sig
    for (const k of kallor) {
      fetch(`/api/search?q=${encodeURIComponent(q)}&kallor=${k}`)
        .then((res) => {
          if (!res.ok) throw new Error("svarsfel");
          return res.json() as Promise<SokResultat>;
        })
        .then((data) => {
          if (id !== sokId.current) return; // en nyare sökning har startat
          setAnnonserPerKalla((prev) => ({ ...prev, [k]: data.annonser }));
          if (data.fel?.length) {
            setFelPerKalla((prev) => ({ ...prev, [k]: data.fel[0].meddelande }));
            setKorStatus((prev) => ({ ...prev, [k]: "fel" }));
          } else {
            setKorStatus((prev) => ({ ...prev, [k]: "klar" }));
          }
        })
        .catch(() => {
          if (id !== sokId.current) return;
          setFelPerKalla((prev) => ({ ...prev, [k]: "Kunde inte hämta" }));
          setKorStatus((prev) => ({ ...prev, [k]: "fel" }));
        });
    }
  }

  const laddar = Object.values(korStatus).some((s) => s === "laddar");

  // Slå ihop alla källors resultat, filtrera och sortera
  const filtreradeAnnonser = useMemo(() => {
    const alla = Object.values(annonserPerKalla).flat();
    return alla
      .filter((a) => aktiveradKalla === "alla" || a.kalla === aktiveradKalla)
      .filter((a) => a.pris === null || (a.pris >= minPris && a.pris <= maxPris))
      .sort((a, b) => {
        if (sortering === "relevans") return (b.relevans ?? 0) - (a.relevans ?? 0);
        if (a.pris === null) return 1;
        if (b.pris === null) return -1;
        return sortering === "pris-asc" ? a.pris - b.pris : b.pris - a.pris;
      });
  }, [annonserPerKalla, aktiveradKalla, minPris, maxPris, sortering]);

  const antalPerKalla: Record<string, number> = useMemo(() => {
    const alla = Object.values(annonserPerKalla).flat();
    const r: Record<string, number> = { alla: alla.length };
    for (const k of ALLA_KALLOR) r[k] = alla.filter((a) => a.kalla === k).length;
    return r;
  }, [annonserPerKalla]);

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--bg-app)" }}>
      <Sidebar
        onSearch={hanteraSok}
        loading={laddar}
        sokord={sokord}
        autoLage={autoLage}
        setAutoLage={setAutoLage}
        valdaKallor={autoLage ? aktivaKallor : valdaKallor}
        toggleKalla={toggleKalla}
        aktiveradKalla={aktiveradKalla}
        setAktiveradKalla={setAktiveradKalla}
        minPris={minPris}
        setMinPris={setMinPris}
        maxPris={maxPris}
        setMaxPris={setMaxPris}
        sortering={sortering}
        setSortering={setSortering}
        antalPerKalla={antalPerKalla}
        harResultat={sokAktiv}
        antalFavoriter={favoriter.length}
        visaFavoriter={visaFavoriter}
        setVisaFavoriter={setVisaFavoriter}
      />

      <main className="flex-1 overflow-y-auto p-6">
        {/* Favoritvy */}
        {visaFavoriter ? (
          <div>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                ❤️ Sparade favoriter ({favoriter.length})
              </h2>
              <button onClick={() => setVisaFavoriter(false)}
                className="text-sm px-3 py-1.5 rounded-lg transition-all"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border-light)", color: "var(--text-secondary)" }}>
                ← Tillbaka till sök
              </button>
            </div>
            {favoriter.length === 0 ? (
              <p className="text-center py-24" style={{ color: "var(--text-muted)" }}>
                Du har inga sparade favoriter än. Klicka på hjärtat på en annons för att spara den.
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {favoriter.map((a) => (
                  <ResultCard key={a.id} annons={a} arFavorit={arFavorit(a.id)} onToggleFavorit={toggleFavorit} />
                ))}
              </div>
            )}
          </div>
        ) : !sokAktiv ? (
          /* Välkomstvy */
          <div className="flex flex-col items-center justify-center h-full gap-3"
            style={{ color: "var(--text-muted)" }}>
            <div className="text-6xl mb-2">🔍</div>
            <p className="text-lg" style={{ color: "var(--text-secondary)" }}>
              Skriv in vad du letar efter i sökfältet
            </p>
            <p className="text-sm">Källorna väljs automatiskt efter söktermen</p>
            <div className="flex gap-2 mt-4 flex-wrap justify-center">
              {["iPhone", "MacBook", "PS5", "Cykel", "AirPods"].map((t) => (
                <button key={t} onClick={() => hanteraSok(t)}
                  className="px-4 py-1.5 rounded-full text-sm transition-colors"
                  style={{ background: "var(--bg-card)", border: "1px solid var(--border-light)", color: "var(--text-secondary)" }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--accent)")}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border-light)")}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ResultsGrid
            annonser={filtreradeAnnonser}
            korStatus={korStatus}
            felPerKalla={felPerKalla}
            query={sokord}
            onSearch={hanteraSok}
            arFavorit={arFavorit}
            onToggleFavorit={toggleFavorit}
          />
        )}
      </main>
    </div>
  );
}
