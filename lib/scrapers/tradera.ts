import { chromium } from "playwright";
import { Annons } from "@/lib/types";

export async function sokTradera(query: string): Promise<Annons[]> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    locale: "sv-SE",
  });

  try {
    const page = await context.newPage();
    await page.goto(
      `https://www.tradera.com/search?q=${encodeURIComponent(query)}&itemType=ALL&order=RELEVANCE`,
      { waitUntil: "networkidle", timeout: 25000 }
    );

    const annonser = await page.evaluate((): Annons[] => {
      // Välj ENDAST huvud-korten — ID:t är "item-card-" + enbart siffror, inga bindestreck efter
      const cards = Array.from(document.querySelectorAll("[id^='item-card-']")).filter(
        (el) => /^item-card-\d+$/.test(el.id)
      );

      return cards.map((card): Annons => {
        const id = card.id.replace("item-card-", "");

        // Länk och titel från bild-ankaret
        const lankEl = card.querySelector("a[data-testid='item-card-image']") as HTMLAnchorElement | null;
        const href = lankEl?.getAttribute("href") ?? "";
        const lank = href ? `https://www.tradera.com${href}` : "";
        const titel = lankEl?.getAttribute("title")?.trim() || "Utan titel";

        // Bild — ta src direkt från img-taggen
        const img = card.querySelector("img") as HTMLImageElement | null;
        const bildUrl = img?.src || null;

        // Pris — extrahera bara siffror från pristext, t.ex. "Pris:312 kr,Ledande bud." → 312
        const prisEl = card.querySelector(`[id='item-card-${id}-price']`);
        const prisText = prisEl?.textContent ?? "";
        const prisMatch = prisText.match(/(\d[\d\s]*)\s*kr/);
        const pris = prisMatch ? parseInt(prisMatch[1].replace(/\s/g, ""), 10) : null;

        // "Ledande bud" = auktion, annars köp nu
        const annonsTyp: Annons["annonsTyp"] = prisText.toLowerCase().includes("ledande bud") ? "auktion" : "köp-nu";

        return {
          id: `tradera-${id}`,
          titel,
          pris: pris && !isNaN(pris) ? pris : null,
          bildUrl,
          lank,
          plats: null,
          kalla: "tradera" as Annons["kalla"],
          publiceradDatum: null,
          annonsTyp,
        };
      }).filter((a) => a.lank !== ""); // Filtrera bort rader utan länk
    });

    return annonser;
  } finally {
    await browser.close();
  }
}
