"use client";

import { FormEvent } from "react";
import { Annons } from "@/lib/types";

type Kalla = Annons["kalla"];

interface SidebarProps {
  onSearch: (q: string) => void;
  loading: boolean;
  sokord: string;
  autoLage: boolean;
  setAutoLage: (v: boolean) => void;
  valdaKallor: Set<Kalla>;
  toggleKalla: (k: Kalla) => void;
  aktiveradKalla: Kalla | "alla";
  setAktiveradKalla: (k: Kalla | "alla") => void;
  minPris: number;
  setMinPris: (p: number) => void;
  maxPris: number;
  setMaxPris: (p: number) => void;
  sortering: "pris-asc" | "pris-desc" | "relevans";
  setSortering: (s: "pris-asc" | "pris-desc" | "relevans") => void;
  antalPerKalla: Record<string, number>;
  harResultat: boolean;
  antalFavoriter: number;
  visaFavoriter: boolean;
  setVisaFavoriter: (v: boolean) => void;
}

const KALLOR: { id: Kalla; label: string; farg: string }[] = [
  { id: "blocket", label: "Blocket", farg: "#f97316" },
  { id: "tradera", label: "Tradera", farg: "#22c55e" },
  { id: "sellpy",  label: "Sellpy",  farg: "#a78bfa" },
  { id: "vinted",  label: "Vinted",  farg: "#38bdf8" },
  { id: "wayke",   label: "Wayke",   farg: "#fb7185" },
];

const MAX = 50000;
const MIN = 0;

function formatPris(v: number) {
  if (v >= MAX) return "50 000+ kr";
  if (v <= MIN) return "0 kr";
  return `${v.toLocaleString("sv-SE")} kr`;
}

export default function Sidebar({
  onSearch, loading, sokord,
  autoLage, setAutoLage,
  valdaKallor, toggleKalla,
  aktiveradKalla, setAktiveradKalla,
  minPris, setMinPris,
  maxPris, setMaxPris,
  sortering, setSortering,
  antalPerKalla, harResultat,
  antalFavoriter, visaFavoriter, setVisaFavoriter,
}: SidebarProps) {

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const val = (e.currentTarget.elements.namedItem("q") as HTMLInputElement).value;
    onSearch(val);
  }

  return (
    <aside
      className="flex flex-col w-60 flex-shrink-0 overflow-y-auto"
      style={{ background: "var(--bg-sidebar)", borderRight: "1px solid var(--border-light)" }}
    >
      {/* Logo */}
      <div className="px-5 pt-5 pb-4 flex items-center gap-2.5"
        style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="w-7 h-7 rounded-lg flex-shrink-0" style={{ background: "var(--accent)" }} />
        <span className="font-semibold text-base" style={{ color: "var(--text-primary)" }}>Begagnat</span>
      </div>

      {/* Sökfält */}
      <div className="px-4 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <input
            name="q"
            defaultValue={sokord}
            key={sokord}
            placeholder="Sök produkt..."
            disabled={loading}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none transition-all"
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid var(--border-light)",
              color: "var(--text-primary)",
            }}
            onFocus={e => (e.currentTarget.style.borderColor = "var(--accent)")}
            onBlur={e => (e.currentTarget.style.borderColor = "var(--border-light)")}
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              background: loading ? "rgba(249,115,22,0.5)" : "var(--accent)",
              color: "#fff",
              border: "1px solid rgba(255,255,255,0.15)",
            }}
          >
            {loading ? "Söker..." : "Sök"}
          </button>
        </form>
        {!harResultat && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {["iPhone", "PS5", "Cykel", "MacBook"].map((t) => (
              <button key={t} onClick={() => onSearch(t)}
                className="px-2.5 py-1 rounded-full text-xs"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--border-light)", color: "var(--text-secondary)" }}>
                {t}
              </button>
            ))}
          </div>
        )}

        {/* Favoriter-knapp */}
        <button
          onClick={() => setVisaFavoriter(!visaFavoriter)}
          className="flex items-center justify-center gap-2 w-full mt-3 py-2 rounded-lg text-sm font-medium transition-all"
          style={{
            background: visaFavoriter ? "rgba(244,63,94,0.15)" : "rgba(255,255,255,0.05)",
            border: `1px solid ${visaFavoriter ? "rgba(244,63,94,0.4)" : "var(--border-light)"}`,
            color: visaFavoriter ? "#fb7185" : "var(--text-secondary)",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24"
            fill={visaFavoriter ? "#fb7185" : "none"} stroke="#fb7185"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
          Favoriter {antalFavoriter > 0 && `(${antalFavoriter})`}
        </button>
      </div>

      <div className="flex flex-col gap-5 px-4 py-5">

        {/* SÖK BLAND — checkboxar */}
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <p className="text-xs font-semibold uppercase tracking-widest"
              style={{ color: "var(--text-muted)" }}>Sök bland</p>
            {/* Auto-växel */}
            <button
              onClick={() => setAutoLage(!autoLage)}
              className="flex items-center gap-1.5 text-xs transition-all"
              style={{ color: autoLage ? "var(--accent)" : "var(--text-muted)" }}
            >
              <span
                className="relative inline-block rounded-full transition-all"
                style={{
                  width: 26, height: 15,
                  background: autoLage ? "var(--accent)" : "rgba(255,255,255,0.15)",
                }}
              >
                <span
                  className="absolute rounded-full bg-white transition-all"
                  style={{ width: 11, height: 11, top: 2, left: autoLage ? 13 : 2 }}
                />
              </span>
              Auto
            </button>
          </div>

          {autoLage && (
            <p className="text-xs mb-2 leading-snug" style={{ color: "var(--text-muted)" }}>
              Källor väljs automatiskt efter söktermen. Klicka på en källa för att välja manuellt.
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            {KALLOR.map((k) => {
              const vald = valdaKallor.has(k.id);
              return (
                <label key={k.id}
                  className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg cursor-pointer transition-all"
                  style={{ opacity: vald ? 1 : 0.4 }}
                  onClick={() => toggleKalla(k.id)}>
                  {/* Custom checkbox */}
                  <span
                    className="flex-shrink-0 flex items-center justify-center w-4 h-4 rounded transition-all"
                    style={{
                      background: vald ? k.farg : "transparent",
                      border: `1.5px solid ${vald ? k.farg : "rgba(255,255,255,0.25)"}`,
                    }}
                  >
                    {vald && (
                      <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                        <path d="M1 3.5L3.5 6L8 1" stroke="#000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </span>
                  <span
                    className="flex-1 text-sm select-none"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {k.label}
                  </span>
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: k.farg }} />
                </label>
              );
            })}
          </div>
        </div>

        {/* VISA BARA — filtrering av sökresultat */}
        {harResultat && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest mb-2"
              style={{ color: "var(--text-muted)" }}>Visa bara</p>
            <div className="flex flex-col gap-1">
              {[{ id: "alla" as const, label: "Alla", farg: "#9ca3af" }, ...KALLOR.filter(k => valdaKallor.has(k.id))].map((alt) => {
                const aktiv = aktiveradKalla === alt.id;
                return (
                  <button key={alt.id}
                    onClick={() => setAktiveradKalla(alt.id)}
                    className="flex items-center gap-2.5 w-full px-3 py-1.5 rounded-lg text-sm transition-all"
                    style={{
                      background: aktiv ? "var(--accent-bg)" : "transparent",
                      border: aktiv ? "1px solid rgba(249,115,22,0.3)" : "1px solid transparent",
                      color: aktiv ? "var(--text-primary)" : "var(--text-secondary)",
                    }}
                  >
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: alt.farg }} />
                    <span className="flex-1 text-left">{alt.label}</span>
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {antalPerKalla[alt.id] ?? 0}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Prisintervall */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest mb-3"
            style={{ color: "var(--text-muted)" }}>Prisintervall</p>
          <div className="flex gap-2 mb-3">
            <div className="flex-1">
              <label className="text-xs mb-1 block" style={{ color: "var(--text-muted)" }}>Min (kr)</label>
              <input
                type="number"
                min={0}
                value={minPris === 0 ? "" : minPris}
                placeholder="0"
                onChange={(e) => {
                  const v = e.target.value === "" ? 0 : Math.max(0, Number(e.target.value));
                  setMinPris(Math.min(v, maxPris - 1));
                }}
                className="w-full px-2 py-1.5 rounded-lg text-sm outline-none"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid var(--border-light)",
                  color: "var(--text-primary)",
                }}
                onFocus={e => (e.currentTarget.style.borderColor = "var(--accent)")}
                onBlur={e => (e.currentTarget.style.borderColor = "var(--border-light)")}
              />
            </div>
            <div className="flex-1">
              <label className="text-xs mb-1 block" style={{ color: "var(--text-muted)" }}>Max (kr)</label>
              <input
                type="number"
                min={0}
                value={maxPris >= MAX ? "" : maxPris}
                placeholder="∞"
                onChange={(e) => {
                  const v = e.target.value === "" ? MAX : Math.max(0, Number(e.target.value));
                  setMaxPris(Math.max(v, minPris + 1));
                }}
                className="w-full px-2 py-1.5 rounded-lg text-sm outline-none"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid var(--border-light)",
                  color: "var(--text-primary)",
                }}
                onFocus={e => (e.currentTarget.style.borderColor = "var(--accent)")}
                onBlur={e => (e.currentTarget.style.borderColor = "var(--border-light)")}
              />
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-xs mb-1 block" style={{ color: "var(--text-muted)" }}>Minimum</label>
              <input type="range" min={MIN} max={MAX} step={500} value={minPris}
                onChange={(e) => setMinPris(Math.min(Number(e.target.value), maxPris - 500))} />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: "var(--text-muted)" }}>Maximum</label>
              <input type="range" min={MIN} max={MAX} step={500} value={maxPris}
                onChange={(e) => setMaxPris(Math.max(Number(e.target.value), minPris + 500))} />
            </div>
          </div>
        </div>

        {/* Sortering */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest mb-2"
            style={{ color: "var(--text-muted)" }}>Sortering</p>
          <div className="flex flex-col gap-1">
            {([
              { id: "relevans",  label: "Relevans" },
              { id: "pris-asc",  label: "Pris: lågt → högt" },
              { id: "pris-desc", label: "Pris: högt → lågt" },
            ] as const).map((s) => {
              const aktiv = sortering === s.id;
              return (
                <button key={s.id} onClick={() => setSortering(s.id)}
                  className="px-3 py-2 rounded-lg text-sm text-left transition-all"
                  style={{
                    background: aktiv ? "var(--accent-bg)" : "transparent",
                    border: aktiv ? "1px solid rgba(249,115,22,0.3)" : "1px solid transparent",
                    color: aktiv ? "var(--text-primary)" : "var(--text-secondary)",
                  }}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </aside>
  );
}
