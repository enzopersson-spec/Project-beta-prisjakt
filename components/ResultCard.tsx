import Image from "next/image";
import { Annons } from "@/lib/types";

const KALLA_STIL: Record<Annons["kalla"], { text: string; prick: string; namn: string }> = {
  blocket: { text: "#f97316", prick: "#f97316", namn: "Blocket" },
  tradera: { text: "#22c55e", prick: "#22c55e", namn: "Tradera" },
  sellpy:  { text: "#a78bfa", prick: "#a78bfa", namn: "Sellpy"  },
  vinted:  { text: "#38bdf8", prick: "#38bdf8", namn: "Vinted"  },
  wayke:   { text: "#fb7185", prick: "#fb7185", namn: "Wayke"   },
  hemnet:  { text: "#facc15", prick: "#facc15", namn: "Hemnet"  },
  plick:   { text: "#f472b6", prick: "#f472b6", namn: "Plick"   },
};

interface ResultCardProps {
  annons: Annons;
  arFavorit: boolean;
  onToggleFavorit: (annons: Annons) => void;
}

export default function ResultCard({ annons, arFavorit, onToggleFavorit }: ResultCardProps) {
  const stil = KALLA_STIL[annons.kalla];

  return (
    <a
      href={annons.lank}
      target="_blank"
      rel="noopener noreferrer"
      className="flex flex-col overflow-hidden transition-all duration-200 group"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: "14px",
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.border = "1px solid var(--border-light)";
        (e.currentTarget as HTMLElement).style.background = "var(--bg-card-hover)";
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.border = "1px solid var(--border)";
        (e.currentTarget as HTMLElement).style.background = "var(--bg-card)";
      }}
    >
      {/* Bild */}
      <div className="relative overflow-hidden" style={{ height: "200px", background: "rgba(255,255,255,0.04)" }}>
        {annons.bildUrl ? (
          <Image
            src={annons.bildUrl}
            alt={annons.titel}
            fill
            className="object-cover group-hover:scale-[1.03] transition-transform duration-300"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            unoptimized
          />
        ) : (
          <div className="flex items-center justify-center h-full text-4xl opacity-20">📦</div>
        )}

        {/* Käll-badge */}
        <span
          className="absolute top-2.5 left-2.5 flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
          style={{
            background: "rgba(15,15,17,0.75)",
            backdropFilter: "blur(6px)",
            border: "1px solid rgba(255,255,255,0.12)",
            color: stil.text,
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: stil.prick }} />
          {stil.namn}
        </span>

        {/* Favorit-hjärta */}
        <button
          type="button"
          aria-label={arFavorit ? "Ta bort från favoriter" : "Spara som favorit"}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleFavorit(annons);
          }}
          className="absolute top-2.5 right-2.5 flex items-center justify-center w-8 h-8 rounded-full transition-all hover:scale-110"
          style={{
            background: "rgba(15,15,17,0.75)",
            backdropFilter: "blur(6px)",
            border: "1px solid rgba(255,255,255,0.12)",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24"
            fill={arFavorit ? "#f43f5e" : "none"}
            stroke={arFavorit ? "#f43f5e" : "#e5e7eb"}
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </button>

        {/* Auktion / Köp nu-tag (nere till vänster) */}
        {annons.annonsTyp && (
          <span
            className="absolute bottom-2.5 left-2.5 text-xs font-medium px-2.5 py-1 rounded-full"
            style={
              annons.annonsTyp === "auktion"
                ? { background: "#92400e", border: "1px solid #d97706", color: "#fde68a" }
                : { background: "#14532d", border: "1px solid #16a34a", color: "#86efac" }
            }
          >
            {annons.annonsTyp === "auktion" ? "Auktion" : "Köp nu"}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="p-3 flex flex-col gap-1.5">
        <p className="text-sm line-clamp-2 leading-snug" style={{ color: "var(--text-primary)" }}>
          {annons.titel}
        </p>

        <span className="text-base font-semibold" style={{ color: "#fff" }}>
          {annons.pris != null ? `${annons.pris.toLocaleString("sv-SE")} kr` : "Pris saknas"}
        </span>

        {(annons.plats || annons.publiceradDatum) && (
          <div className="flex items-center justify-between text-xs" style={{ color: "var(--text-muted)" }}>
            {annons.plats && <span>📍 {annons.plats}</span>}
            {annons.publiceradDatum && <span>{annons.publiceradDatum}</span>}
          </div>
        )}
      </div>
    </a>
  );
}
