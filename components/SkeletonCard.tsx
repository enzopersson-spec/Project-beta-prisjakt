// Pulserande platshållare som visas medan en källa fortfarande laddar.
export default function SkeletonCard() {
  return (
    <div
      className="flex flex-col overflow-hidden animate-pulse"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: "14px",
      }}
    >
      <div style={{ height: "200px", background: "rgba(255,255,255,0.05)" }} />
      <div className="p-3 flex flex-col gap-2">
        <div className="h-3.5 rounded" style={{ background: "rgba(255,255,255,0.07)", width: "90%" }} />
        <div className="h-3.5 rounded" style={{ background: "rgba(255,255,255,0.07)", width: "55%" }} />
        <div className="h-4 rounded mt-1" style={{ background: "rgba(255,255,255,0.1)", width: "40%" }} />
      </div>
    </div>
  );
}
