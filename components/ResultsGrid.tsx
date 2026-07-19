"use client";

import { FormEvent } from "react";
import { Annons } from "@/lib/types";
import ResultCard from "@/components/ResultCard";
import SkeletonCard from "@/components/SkeletonCard";

type Status = "laddar" | "klar" | "fel";

const KALLA_NAMN: Record<string, { namn: string; farg: string }> = {
  blocket: { namn: "Blocket", farg: "#f97316" },
  tradera: { namn: "Tradera", farg: "#22c55e" },
  sellpy:  { namn: "Sellpy",  farg: "#a78bfa" },
  vinted:  { namn: "Vinted",  farg: "#38bdf8" },
  wayke:   { namn: "Wayke",   farg: "#fb7185" },
};

interface ResultsGridProps {
  annonser: Annons[];
  korStatus: Record<string, Status>;
  felPerKalla: Record<string, string>;
  query: string;
  onSearch: (q: string) => void;
  arFavorit: (id: string) => boolean;
  onToggleFavorit: (annons: Annons) => void;
}

export default function ResultsGrid({
  annonser, korStatus, felPerKalla, query, onSearch, arFavorit, onToggleFavorit,
}: ResultsGridProps) {
  const laddar = Object.values(korStatus).some((s) => s === "laddar");

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const val = (e.currentTarget.elements.namedItem("q") as HTMLInputElement).value.trim();
    if (val.length >= 2) onSearch(val);
  }

  // Pris-sammanfattning från annonser med känt pris
  const priser = annonser.map((a) => a.pris).filter((p): p is number => p != null);
  const lagst = priser.length ? Math.min(...priser) : null;
  const hogst = priser.length ? Math.max(...priser) : null;
  const snitt = priser.length ? Math.round(priser.reduce((s, p) => s + p, 0) / priser.length) : null;
  const kr = (n: number) => `${n.toLocaleString("sv-SE")} kr`;

  // Källor som fortfarande laddar → visa skelett-kort
  const antalLaddar = Object.values(korStatus).filter((s) => s === "laddar").length;
  const antalSkelett = Math.min(antalLaddar * 4, 12);

  return (
    <div className="w-full">
      {/* Sökfält ovanför träffarna */}
      <form onSubmit={handleSubmit} className="flex gap-2 mb-5">
        <input
          name="q"
          key={query}
          defaultValue={query}
          placeholder="Sök igen..."
          className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none transition-all"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border-light)",
            color: "var(--text-primary)",
          }}
          onFocus={e => (e.currentTarget.style.borderColor = "var(--accent)")}
          onBlur={e => (e.currentTarget.style.borderColor = "var(--border-light)")}
        />
        <button
          type="submit"
          className="px-5 py-2.5 rounded-xl text-sm font-medium transition-all"
          style={{ background: "var(--accent)", color: "#fff", border: "1px solid rgba(255,255,255,0.15)" }}
        >
          Sök
        </button>
      </form>

      {/* Källstatus – bockar för klara, spinner för laddande */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {Object.keys(korStatus).map((k) => {
          const st = korStatus[k];
          const info = KALLA_NAMN[k] ?? { namn: k, farg: "#9ca3af" };
          return (
            <span key={k}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full"
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                color: st === "fel" ? "#f87171" : "var(--text-secondary)",
                opacity: st === "laddar" ? 0.7 : 1,
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: info.farg }} />
              {info.namn}
              {st === "laddar" && (
                <span className="w-3 h-3 rounded-full border-2 border-t-transparent animate-spin"
                  style={{ borderColor: `${info.farg} transparent transparent transparent` }} />
              )}
              {st === "klar" && <span style={{ color: "#4ade80" }}>✓</span>}
              {st === "fel" && <span>✕</span>}
            </span>
          );
        })}
      </div>

      {/* Fel */}
      {Object.keys(felPerKalla).length > 0 && (
        <div className="mb-4 p-3 rounded-xl text-sm"
          style={{ background: "rgba(234,179,8,0.1)", border: "1px solid rgba(234,179,8,0.25)", color: "#fbbf24" }}>
          {Object.entries(felPerKalla).map(([k, m]) => (
            <p key={k}>⚠️ {KALLA_NAMN[k]?.namn ?? k}: {m}</p>
          ))}
        </div>
      )}

      {/* Pris-sammanfattning */}
      {priser.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-5 px-4 py-3 rounded-xl"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <div>
            <span className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>{annonser.length}</span>
            <span className="text-xs ml-1.5" style={{ color: "var(--text-muted)" }}>träffar</span>
          </div>
          <div className="h-6 w-px" style={{ background: "var(--border-light)" }} />
          <div><span className="text-xs" style={{ color: "var(--text-muted)" }}>Lägst </span>
            <span className="text-sm font-semibold" style={{ color: "#4ade80" }}>{kr(lagst!)}</span></div>
          <div><span className="text-xs" style={{ color: "var(--text-muted)" }}>Snitt </span>
            <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{kr(snitt!)}</span></div>
          <div><span className="text-xs" style={{ color: "var(--text-muted)" }}>Högst </span>
            <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{kr(hogst!)}</span></div>
        </div>
      )}

      {/* Rutnät med kort + skelett */}
      {annonser.length === 0 && !laddar ? (
        <p className="text-center py-24 text-base" style={{ color: "var(--text-muted)" }}>
          Inga annonser matchar &ldquo;{query}&rdquo;.
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {annonser.map((annons) => (
            <ResultCard
              key={annons.id}
              annons={annons}
              arFavorit={arFavorit(annons.id)}
              onToggleFavorit={onToggleFavorit}
            />
          ))}
          {laddar && Array.from({ length: antalSkelett }).map((_, i) => <SkeletonCard key={`skelett-${i}`} />)}
        </div>
      )}
    </div>
  );
}
