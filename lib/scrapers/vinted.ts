import { chromium } from "playwright";
import { Annons } from "@/lib/types";

export async function sokVinted(query: string): Promise<Annons[]> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    locale: "sv-SE",
  });

  try {
    const page = await context.newPage();
    await page.goto(
      `https://www.vinted.se/catalog?search_text=${encodeURIComponent(query)}`,
      { waitUntil: "networkidle", timeout: 25000 }
    );

    return await page.evaluate((): Annons[] => {
      const cards = document.querySelectorAll(".new-item-box__container");
      return Array.from(cards).map((card): Annons => {
        const a = card.closest("a") as HTMLAnchorElement | null;
        const img = card.querySelector("img") as HTMLImageElement | null;
        const priceEl = card.querySelector("[class*='price'], [data-testid*='price']");

        // Titel från alt-texten, klipp bort "varumärke: X, modell: Y, skick: Z"
        const altRaw = img?.getAttribute("alt") ?? "Utan titel";
        const titel = altRaw.replace(/,\s*(varumärke|modell|skick):.*$/i, "").trim() || "Utan titel";

        const prisText = priceEl?.textContent?.trim() ?? "";
        const pris = parseInt(prisText.replace(/[^\d]/g, ""), 10) || null;
        const href = a?.getAttribute("href") ?? "";

        return {
          id: `vinted-${href.split("?")[0]}`,
          titel,
          pris: pris && !isNaN(pris) ? pris : null,
          bildUrl: img?.src ?? null,
          lank: href || "",
          plats: null,
          kalla: "vinted",
          publiceradDatum: null,
          annonsTyp: "köp-nu",
        };
      }).filter((a) => a.lank !== "");
    });
  } finally {
    await browser.close();
  }
}
