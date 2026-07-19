import { chromium } from "playwright";
import { Annons } from "@/lib/types";

export async function sokSellpy(query: string): Promise<Annons[]> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    locale: "sv-SE",
  });

  try {
    const page = await context.newPage();
    await page.goto(
      `https://www.sellpy.se/search?search_term=${encodeURIComponent(query)}`,
      { waitUntil: "networkidle", timeout: 25000 }
    );

    return await page.evaluate((): Annons[] => {
      const cards = document.querySelectorAll(".item-tile-container");
      return Array.from(cards).map((card): Annons => {
        const a = card.querySelector("a") as HTMLAnchorElement | null;
        const img = card.querySelector("img") as HTMLImageElement | null;
        const label = a?.getAttribute("aria-label") ?? "";

        // aria-label: "Brand, Titel, Strl: X, 1 135 SEK"
        const prisMatch = label.match(/([\d\s]+)\s*SEK/);
        const pris = prisMatch ? parseInt(prisMatch[1].replace(/\s/g, ""), 10) : null;
        const titel = label.replace(/,?\s*[\d\s]+\s*SEK\s*$/, "").trim() || "Utan titel";
        const href = a?.getAttribute("href") ?? "";

        return {
          id: `sellpy-${href}`,
          titel,
          pris: pris && !isNaN(pris) ? pris : null,
          bildUrl: img?.src ?? null,
          lank: href ? `https://www.sellpy.se${href}` : "",
          plats: null,
          kalla: "sellpy",
          publiceradDatum: null,
          annonsTyp: "köp-nu",
        };
      }).filter((a) => a.lank !== "");
    });
  } finally {
    await browser.close();
  }
}
