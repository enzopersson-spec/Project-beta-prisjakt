import { NextRequest, NextResponse } from "next/server";
import { sokBlocket } from "@/lib/scrapers/blocket";
import { sokTradera } from "@/lib/scrapers/tradera";
import { sokSellpy } from "@/lib/scrapers/sellpy";
import { sokWayke } from "@/lib/scrapers/wayke";
import { sokVinted } from "@/lib/scrapers/vinted";
import { likhetsPoang } from "@/lib/embeddings";
import { SokResultat, Annons } from "@/lib/types";

const SCRAPERS: Record<string, (q: string) => Promise<import("@/lib/types").Annons[]>> = {
  blocket: sokBlocket,
  tradera: sokTradera,
  sellpy:  sokSellpy,
  wayke:   sokWayke,
  vinted:  sokVinted,
};

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q");
  if (!query || query.trim().length < 2) {
    return NextResponse.json({ error: "Sökterm krävs" }, { status: 400 });
  }

  const kallorParam = req.nextUrl.searchParams.get("kallor");
  const valdaKallor = kallorParam
    ? kallorParam.split(",").filter((k) => k in SCRAPERS)
    : Object.keys(SCRAPERS);

  const resultat: SokResultat = { annonser: [], fel: [] };

  const jobb = valdaKallor.map((k) => ({ namn: k, scraper: SCRAPERS[k] }));
  const utfall = await Promise.allSettled(jobb.map(({ scraper }) => scraper(query)));

  // Reducera ett ord till en stam genom att klippa bort vanliga svenska böjningsändelser
  // t.ex. "badbyxor" -> "badbyx", så att "badbyxa"/"badbyxor" också matchar
  function stam(ord: string): string {
    let s = ord;
    for (const slut of ["orna", "erna", "arna", "or", "ar", "er", "en", "et", "na", "n", "a"]) {
      if (s.length - slut.length >= 3 && s.endsWith(slut)) {
        s = s.slice(0, -slut.length);
        break;
      }
    }
    return s;
  }

  // Dela upp en text i hela ord (bokstäver/siffror), gemener + stam
  function tokenisera(text: string): string[] {
    return text
      .toLowerCase()
      .split(/[^a-z0-9åäö]+/i)
      .filter((w) => w.length > 1)
      .map(stam);
  }

  // Ett sökord matchar en titel om titeln innehåller samma hela ord (efter stamning)
  function ordMatchar(sokord: string, titelOrd: string[]): boolean {
    return titelOrd.some(
      (t) => t === sokord || (t.length >= 4 && sokord.length >= 4 && (t.startsWith(sokord) || sokord.startsWith(t)))
    );
  }

  const sokord = tokenisera(query);

  // Samla ihop alla träffar (och fel) från källorna
  let allaAnnonser: Annons[] = [];
  for (let i = 0; i < jobb.length; i++) {
    const res = utfall[i];
    const namn = jobb[i].namn;
    if (res.status === "fulfilled") {
      allaAnnonser.push(...res.value);
    } else {
      resultat.fel.push({ kalla: namn, meddelande: res.reason?.message ?? "Okänt fel" });
    }
  }

  // Ta bort dubletter baserat på id
  const sedda = new Set<string>();
  allaAnnonser = allaAnnonser.filter((a) => {
    if (sedda.has(a.id)) return false;
    sedda.add(a.id);
    return true;
  });

  // Exakt ordmatchning: alla sökord måste finnas som hela ord i titeln
  const ordTraffar = allaAnnonser.filter((a) => {
    const titelOrd = tokenisera(a.titel);
    return sokord.every((s) => ordMatchar(s, titelOrd));
  });

  // Semantiskt lager: ranka efter betydelse, och rädda synonymer om ordmatchning gav noll
  let slutliga: Annons[] = ordTraffar;
  try {
    const poang = await likhetsPoang(query, allaAnnonser.map((a) => a.titel));
    const poangFor = new Map<string, number>();
    allaAnnonser.forEach((a, i) => {
      const s = poang[i] ?? 0;
      poangFor.set(a.id, s);
      a.relevans = s; // spara poängen så klienten kan ranka över källor
    });

    if (ordTraffar.length > 0) {
      // Vi har exakta träffar – behåll bara dem, men ranka efter semantisk relevans
      slutliga = [...ordTraffar].sort(
        (a, b) => (poangFor.get(b.id) ?? 0) - (poangFor.get(a.id) ?? 0)
      );
    } else {
      // Inga exakta träffar (t.ex. "ps5" mot "PlayStation 5") – rädda synonymer.
      // e5 ger höga baslinjer överallt, så vi räddar RELATIVT till bästa träffen
      // istället för mot ett fast golv (som annars släpper in brus).
      const TOPP_GOLV = 0.82;  // bästa träffen måste vara minst så här bra
      const MARGINAL = 0.025;  // behåll allt inom denna marginal från toppen
      const medPoang = allaAnnonser.map((a) => ({ a, s: poangFor.get(a.id) ?? 0 }));
      const toppScore = Math.max(...medPoang.map((x) => x.s));

      slutliga = toppScore >= TOPP_GOLV
        ? medPoang
            .filter((x) => x.s >= toppScore - MARGINAL)
            .sort((x, y) => y.s - x.s)
            .slice(0, 40)
            .map((x) => x.a)
        : []; // inget tillräckligt semantiskt relevant – visa hellre inget än brus
    }
  } catch (e) {
    // Om modellen inte kan laddas – fall tillbaka på ordmatchning utan semantik
    console.error("Embeddings misslyckades, faller tillbaka på ordmatchning:", e);
    slutliga = ordTraffar;
  }

  resultat.annonser = slutliga;
  return NextResponse.json(resultat);
}
