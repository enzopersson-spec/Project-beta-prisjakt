import { chromium } from "playwright";
import { Annons } from "@/lib/types";

export async function sokBlocket(query: string): Promise<Annons[]> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    locale: "sv-SE",
  });

  try {
    const page = await context.newPage();
    await page.goto(
      `https://www.blocket.se/recommerce/forsale/search?q=${encodeURIComponent(query)}`,
      { waitUntil: "networkidle", timeout: 25000 }
    );

    const annonser = await page.evaluate((): Annons[] => {
      const items = document.querySelectorAll("article.sf-search-ad");
      const resultat: Annons[] = [];

      items.forEach((item) => {
        const lankEl = item.querySelector("a.sf-search-ad-link") as HTMLAnchorElement;
        const lank = lankEl?.href ?? "";
        const idRaw = lank.split("/").filter(Boolean).pop() ?? Math.random().toString(36).slice(2);

        const titel = item.querySelector("h2")?.textContent?.trim() ?? "Utan titel";

        const prisText = item.querySelector(".font-bold.whitespace-nowrap span")?.textContent?.trim() ?? "";
        const pris = prisText ? parseInt(prisText.replace(/[^\d]/g, ""), 10) || null : null;

        const bild = (item.querySelector("img") as HTMLImageElement)?.src ?? null;

        const platsTid = item.querySelectorAll(".s-text-subtle span");
        const plats = platsTid[0]?.textContent?.trim() ?? null;

        resultat.push({
          id: `blocket-${idRaw}`,
          titel,
          pris,
          bildUrl: bild,
          lank,
          plats,
          kalla: "blocket",
          publiceradDatum: platsTid[1]?.textContent?.trim() ?? null,
          annonsTyp: null,
        });
      });

      return resultat;
    });

    return annonser;
  } finally {
    await browser.close();
  }
}
