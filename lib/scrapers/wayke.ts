import { chromium } from "playwright";
import { Annons } from "@/lib/types";

export async function sokWayke(query: string): Promise<Annons[]> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    locale: "sv-SE",
  });

  try {
    const page = await context.newPage();
    await page.goto(
      `https://www.wayke.se/search?query=${encodeURIComponent(query)}`,
      { waitUntil: "networkidle", timeout: 25000 }
    );

    return await page.evaluate((): Annons[] => {
      const cards = document.querySelectorAll("[class*='__card']");
      return Array.from(cards).map((card): Annons => {
        const a = card.closest("a") as HTMLAnchorElement | null
          || card.querySelector("a") as HTMLAnchorElement | null;
        const img = card.querySelector("img") as HTMLImageElement | null;
        const titleEl = card.querySelector("[class*='title'], [class*='Title'], h2, h3");
        const priceEl = card.querySelector("[class*='price'], [class*='Price']");

        const titel = titleEl?.textContent?.trim() || "Utan titel";
        const prisText = priceEl?.textContent?.replace("Kontantpris", "").trim() ?? "";
        const pris = parseInt(prisText.replace(/[^\d]/g, ""), 10) || null;
        const href = a?.getAttribute("href") ?? "";

        return {
          id: `wayke-${href}`,
          titel,
          pris: pris && !isNaN(pris) ? pris : null,
          bildUrl: img?.src ?? null,
          lank: href ? `https://www.wayke.se${href}` : "",
          plats: null,
          kalla: "wayke",
          publiceradDatum: null,
          annonsTyp: "köp-nu",
        };
      }).filter((a) => a.lank !== "");
    });
  } finally {
    await browser.close();
  }
}
