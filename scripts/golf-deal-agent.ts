/**
 * Söker golfklubbor på Blocket/eBay/Facebook Marketplace, låter en Claude-agent
 * normalisera märke/modell/typ per annons, sparar allt i Supabase (golf_listings),
 * flaggar annonser som ligger >= GOLF_DEAL_THRESHOLD_PCT % under gruppens medianpris
 * (flagged_deals) och mejlar en sammanfattning via Resend.
 *
 * Körs med: npx tsx scripts/golf-deal-agent.ts
 *
 * Miljövariabler:
 *   ANTHROPIC_API_KEY        (krävs) – Agent SDK
 *   SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL              (krävs, en av dem)
 *   SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY (krävs, en av dem)
 *   RESEND_API_KEY           (krävs för mejl, annars hoppas mejlsteget över)
 *   RESEND_FROM_EMAIL        default "Golf Deal Agent <onboarding@resend.dev>"
 *   GOLF_DEAL_EMAIL_TO       default "enzo.persson@hotmail.com"
 *   EBAY_CLIENT_ID / EBAY_CLIENT_SECRET  (krävs för eBay-sökning, annars hoppas den över)
 *   EBAY_MARKETPLACE_ID      default "EBAY_US"
 *   FB_STORAGE_STATE_JSON    valfri – Playwright storageState (cookies) för en inloggad
 *                             FB-session. Utan denna hoppas Facebook Marketplace över,
 *                             eftersom sökning där i praktiken kräver inloggning.
 *   GOLF_SEARCH_QUERIES      kommaseparerad lista, se DEFAULT_SEARCH_QUERIES
 *   GOLF_DEAL_THRESHOLD_PCT  default 25
 *   GOLF_MIN_GROUP_SIZE      default 3 (färre jämförbara annonser ger ingen median värd namnet)
 *   GOLF_LISTING_MAX_AGE_DAYS default 14 (äldre annonser räknas inte in i medianen)
 *   CURRENCY_TO_SEK_JSON     valfri override, t.ex. {"USD":10.8,"EUR":11.3,"GBP":13.2}
 */

import { query, tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { sokBlocket } from "../lib/scrapers/blocket";

const CLUB_TYPES = ["driver", "fairway_wood", "hybrid", "irons", "wedge", "putter", "bag", "other"] as const;
type ClubType = (typeof CLUB_TYPES)[number];
type Currency = "SEK" | "USD" | "EUR" | "GBP";
type Platform = "blocket" | "ebay" | "facebook";

const DEFAULT_SEARCH_QUERIES = [
  "golfklubbor",
  "golf driver",
  "golf järnset irons",
  "golf putter",
  "golf wedge",
  "golf hybrid",
];

const SEARCH_QUERIES = (process.env.GOLF_SEARCH_QUERIES?.split(",").map((s) => s.trim()).filter(Boolean)) ?? DEFAULT_SEARCH_QUERIES;
const DEAL_THRESHOLD_PCT = Number(process.env.GOLF_DEAL_THRESHOLD_PCT ?? 25);
const MIN_GROUP_SIZE = Number(process.env.GOLF_MIN_GROUP_SIZE ?? 3);
const MAX_AGE_DAYS = Number(process.env.GOLF_LISTING_MAX_AGE_DAYS ?? 14);
const EMAIL_TO = process.env.GOLF_DEAL_EMAIL_TO ?? "enzo.persson@hotmail.com";
const EMAIL_FROM = process.env.RESEND_FROM_EMAIL ?? "Golf Deal Agent <onboarding@resend.dev>";

const CURRENCY_TO_SEK: Record<Currency, number> = {
  SEK: 1,
  USD: 10.8,
  EUR: 11.3,
  GBP: 13.2,
  ...(process.env.CURRENCY_TO_SEK_JSON ? JSON.parse(process.env.CURRENCY_TO_SEK_JSON) : {}),
};

function toSek(price: number, currency: Currency): number {
  const rate = CURRENCY_TO_SEK[currency] ?? 1;
  return Math.round(price * rate);
}

function supabaseClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL och SUPABASE_SERVICE_ROLE_KEY/NEXT_PUBLIC_SUPABASE_ANON_KEY måste vara satta.");
  }
  return createClient(url, key);
}

// ---- eBay: officiell Browse API, OAuth med client credentials ----

let ebayToken: { value: string; expiresAt: number } | null = null;

async function getEbayToken(): Promise<string | null> {
  const id = process.env.EBAY_CLIENT_ID;
  const secret = process.env.EBAY_CLIENT_SECRET;
  if (!id || !secret) return null;
  if (ebayToken && ebayToken.expiresAt > Date.now()) return ebayToken.value;

  const res = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: "https://api.ebay.com/oauth/api_scope",
    }),
  });
  if (!res.ok) throw new Error(`eBay OAuth misslyckades: ${res.status} ${await res.text()}`);
  const data = await res.json();
  ebayToken = { value: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
  return ebayToken.value;
}

interface RawCandidate {
  platform: Platform;
  listing_url: string;
  title?: string;
  price?: number;
  currency?: Currency;
  condition?: string;
  raw_text?: string;
}

async function searchEbayRaw(searchQuery: string): Promise<RawCandidate[]> {
  const token = await getEbayToken();
  if (!token) return [];
  const marketplace = process.env.EBAY_MARKETPLACE_ID ?? "EBAY_US";
  const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(searchQuery)}&limit=25`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": marketplace,
    },
  });
  if (!res.ok) throw new Error(`eBay-sökning misslyckades: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return (data.itemSummaries ?? []).map((item: any) => ({
    platform: "ebay" as const,
    listing_url: item.itemWebUrl,
    title: item.title,
    price: item.price?.value ? Number(item.price.value) : undefined,
    currency: item.price?.currency as Currency | undefined,
    condition: item.condition,
  }));
}

async function searchBlocketRaw(searchQuery: string): Promise<RawCandidate[]> {
  const annonser = await sokBlocket(searchQuery);
  return annonser
    .filter((a) => a.pris != null)
    .slice(0, 25)
    .map((a) => ({
      platform: "blocket" as const,
      listing_url: a.lank,
      title: a.titel,
      price: a.pris as number,
      currency: "SEK" as const,
    }));
}

// Facebook Marketplace har inget officiellt API och sökresultat kräver i praktiken
// en inloggad session. Vi bygger aldrig automatiserad inloggning (mot FB:s villkor) –
// om användaren tillhandahåller en exporterad Playwright storageState (egna cookies)
// gör vi ett bästa-försök, annars hoppar vi över källan helt utan att krascha körningen.
// FB:s DOM använder obfuskerade klassnamn, så vi hämtar rå text och låter agenten
// tolka titel/pris istället för att lita på spröda CSS-selektorer.
async function searchFacebookRaw(searchQuery: string): Promise<RawCandidate[]> {
  const storageStateJson = process.env.FB_STORAGE_STATE_JSON;
  if (!storageStateJson) return [];

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      storageState: JSON.parse(storageStateJson),
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      locale: "sv-SE",
    });
    const page = await context.newPage();
    await page.goto(`https://www.facebook.com/marketplace/search/?query=${encodeURIComponent(searchQuery)}`, {
      waitUntil: "domcontentloaded",
      timeout: 25000,
    });
    await page.waitForTimeout(3000);

    const candidates = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a[href*="/marketplace/item/"]'));
      const seen = new Set<string>();
      const out: { href: string; text: string }[] = [];
      for (const a of anchors) {
        const href = (a as HTMLAnchorElement).href.split("?")[0];
        if (seen.has(href)) continue;
        seen.add(href);
        out.push({ href, text: (a as HTMLElement).innerText.replace(/\s+/g, " ").trim() });
        if (out.length >= 20) break;
      }
      return out;
    });

    return candidates
      .filter((c) => c.text.length > 0)
      .map((c) => ({ platform: "facebook" as const, listing_url: c.href, raw_text: c.text }));
  } catch (err) {
    console.warn(`Facebook Marketplace-sökning misslyckades för "${searchQuery}":`, (err as Error).message);
    return [];
  } finally {
    await browser.close();
  }
}

// ---- Supabase-skrivning ----

const NormalizedListing = z.object({
  platform: z.enum(["blocket", "ebay", "facebook"]),
  listing_url: z.string().url(),
  title: z.string(),
  brand: z.string().nullable(),
  model: z.string().nullable(),
  club_type: z.enum(CLUB_TYPES),
  condition: z.string().nullable().optional(),
  price: z.number().positive(),
  currency: z.enum(["SEK", "USD", "EUR", "GBP"]),
});

async function saveListings(listings: z.infer<typeof NormalizedListing>[]) {
  const supabase = supabaseClient();
  const rows = listings.map((l) => ({
    platform: l.platform,
    listing_url: l.listing_url,
    title: l.title,
    brand: l.brand,
    model: l.model,
    club_type: l.club_type,
    condition: l.condition ?? null,
    price: toSek(l.price, l.currency),
    found_at: new Date().toISOString(),
  }));
  const { error } = await supabase.from("golf_listings").upsert(rows, { onConflict: "listing_url" });
  if (error) throw error;
  return rows.length;
}

// ---- Agent-verktyg ----

const searchBlocketTool = tool(
  "search_blocket",
  "Sök golfklubbor på Blocket. Returnerar en JSON-lista med kandidatannonser (listing_url, title, price, currency).",
  { query: z.string().describe("Sökterm, t.ex. 'golf driver'") },
  async ({ query: q }) => {
    try {
      const results = await searchBlocketRaw(q);
      return { content: [{ type: "text" as const, text: JSON.stringify(results) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Fel vid Blocket-sökning: ${(err as Error).message}` }] };
    }
  }
);

const searchEbayTool = tool(
  "search_ebay",
  "Sök golfklubbor på eBay via Browse API. Returnerar en JSON-lista med kandidatannonser (listing_url, title, price, currency, condition). Tom lista om EBAY_CLIENT_ID/SECRET saknas.",
  { query: z.string().describe("Sökterm, t.ex. 'golf driver'") },
  async ({ query: q }) => {
    try {
      const results = await searchEbayRaw(q);
      return { content: [{ type: "text" as const, text: JSON.stringify(results) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Fel vid eBay-sökning: ${(err as Error).message}` }] };
    }
  }
);

const searchFacebookTool = tool(
  "search_facebook",
  "Sök golfklubbor på Facebook Marketplace (bästa försök, kräver inloggad session). Returnerar en JSON-lista med kandidater där du själv måste tolka titel/pris/valuta ur raw_text, eftersom sidan saknar stabila selektorer. Tom lista om ingen session finns konfigurerad.",
  { query: z.string().describe("Sökterm, t.ex. 'golf driver'") },
  async ({ query: q }) => {
    const results = await searchFacebookRaw(q);
    return { content: [{ type: "text" as const, text: JSON.stringify(results) }] };
  }
);

const saveListingsTool = tool(
  "save_listings",
  "Spara en batch normaliserade golfklubb-annonser i databasen. Skicka bara med annonser du är säker på faktiskt är golfklubbor. 'price' och 'currency' ska vara oförändrade värden du fick från sök-verktygen (ingen valutaomräkning behövs, det sköts av verktyget).",
  {
    listings: z.array(NormalizedListing).describe("Normaliserade annonser att spara"),
  },
  async ({ listings }) => {
    try {
      const saved = await saveListings(listings);
      return { content: [{ type: "text" as const, text: `Sparade ${saved} annonser.` }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Fel vid sparning: ${(err as Error).message}` }] };
    }
  }
);

const mcpServer = createSdkMcpServer({
  name: "golf-deals",
  version: "1.0.0",
  tools: [searchBlocketTool, searchEbayTool, searchFacebookTool, saveListingsTool],
});

async function runSearchAgent() {
  const clubTypeList = CLUB_TYPES.join(", ");
  const prompt = `Du ska hitta golfklubbor till salu och spara normaliserade annonser i en databas.

Sökfraser att gå igenom, en i taget:
${SEARCH_QUERIES.map((q) => `- ${q}`).join("\n")}

För varje sökfras:
1. Anropa search_blocket, search_ebay och search_facebook med sökfrasen.
2. Gå igenom kandidaterna. Hoppa över allt som uppenbart inte är en golfklubba (t.ex. golfskor, golfbollar, resor).
   För Facebook-kandidater (fältet raw_text) måste du själv tolka ut titel, pris (nummer) och valuta (SEK/USD/EUR/GBP) ur texten.
3. För varje golfklubb-annons: avgör brand (märke, t.ex. "Callaway", "TaylorMade", "Titleist", "Ping", "Mizuno"),
   model (specifik modell, t.ex. "Stealth 2", "Rogue ST Max", "T100") och club_type (ett av: ${clubTypeList}).
   Om märke eller modell inte går att avgöra med rimlig säkerhet, sätt brand/model till null istället för att gissa.
4. Anropa save_listings med den normaliserade batchen för den sökfrasen. Låt price/currency vara exakt de värden
   du fick från sök-verktyget (för Blocket/eBay), eller de du själv tolkade ut ur raw_text (för Facebook).

Svara till sist med en kort textsammanfattning (inga fler verktygsanrop) av hur många annonser du sparade totalt.`;

  const maxTurns = Math.max(40, SEARCH_QUERIES.length * 10);

  for await (const message of query({
    prompt,
    options: {
      model: process.env.GOLF_AGENT_MODEL,
      maxTurns,
      permissionMode: "bypassPermissions",
      allowedTools: [
        "mcp__golf-deals__search_blocket",
        "mcp__golf-deals__search_ebay",
        "mcp__golf-deals__search_facebook",
        "mcp__golf-deals__save_listings",
      ],
      mcpServers: { "golf-deals": mcpServer },
      systemPrompt: "Du är en noggrann research-agent som bara använder de verktyg som erbjuds. Gissa aldrig märke/modell om du är osäker.",
    },
  })) {
    if (message.type === "assistant") {
      for (const block of message.message.content as any[]) {
        if (block.type === "text" && block.text?.trim()) console.log("[agent]", block.text.trim());
        if (block.type === "tool_use") console.log(`[agent] anropar ${block.name}`, JSON.stringify(block.input));
      }
    } else if (message.type === "result") {
      console.log("[agent] klar:", message.subtype, message.stop_reason ?? "");
    }
  }
}

// ---- Deterministisk gruppering + flaggning ----

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
}

interface FlaggedDeal {
  listing_id: string;
  title: string;
  listing_url: string;
  platform: string;
  price: number;
  group_median: number;
  comparable_count: number;
  deviation_pct: number;
}

async function flagUndervaluedDeals(): Promise<FlaggedDeal[]> {
  const supabase = supabaseClient();
  const cutoff = new Date(Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: listings, error } = await supabase
    .from("golf_listings")
    .select("id, listing_url, title, brand, model, club_type, price, platform")
    .gte("found_at", cutoff)
    .not("brand", "is", null)
    .not("model", "is", null)
    .not("club_type", "is", null);
  if (error) throw error;
  if (!listings || listings.length === 0) return [];

  const groups = new Map<string, typeof listings>();
  for (const l of listings) {
    const key = `${l.brand!.trim().toLowerCase()}|${l.model!.trim().toLowerCase()}|${l.club_type!.trim().toLowerCase()}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(l);
  }

  const candidates: FlaggedDeal[] = [];
  for (const group of groups.values()) {
    if (group.length < MIN_GROUP_SIZE) continue;
    const med = median(group.map((l) => l.price));
    const threshold = med * (1 - DEAL_THRESHOLD_PCT / 100);
    for (const l of group) {
      if (l.price <= threshold) {
        candidates.push({
          listing_id: l.id,
          title: l.title ?? "(utan titel)",
          listing_url: l.listing_url,
          platform: l.platform,
          price: l.price,
          group_median: med,
          comparable_count: group.length,
          deviation_pct: Math.round(((med - l.price) / med) * 1000) / 10,
        });
      }
    }
  }
  if (candidates.length === 0) return [];

  const { data: already, error: alreadyErr } = await supabase.from("flagged_deals").select("listing_id");
  if (alreadyErr) throw alreadyErr;
  const flaggedIds = new Set((already ?? []).map((r) => r.listing_id));

  const newDeals = candidates.filter((c) => !flaggedIds.has(c.listing_id));
  if (newDeals.length === 0) return [];

  const { error: insertErr } = await supabase.from("flagged_deals").insert(
    newDeals.map((d) => ({
      listing_id: d.listing_id,
      group_median: d.group_median,
      comparable_count: d.comparable_count,
      deviation_pct: d.deviation_pct,
    }))
  );
  if (insertErr) throw insertErr;

  return newDeals;
}

async function sendDealAlertEmail(deals: FlaggedDeal[]) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("RESEND_API_KEY saknas, hoppar över mejl.");
    return;
  }

  const rows = deals
    .map(
      (d) =>
        `<tr>
          <td>${d.title}</td>
          <td>${d.platform}</td>
          <td>${d.price} kr</td>
          <td>${d.group_median} kr</td>
          <td>-${d.deviation_pct}%</td>
          <td>${d.comparable_count}</td>
          <td><a href="${d.listing_url}">Visa</a></td>
        </tr>`
    )
    .join("\n");

  const html = `<h2>⛳ ${deals.length} golf-fynd minst ${DEAL_THRESHOLD_PCT}% under medianpris</h2>
<table border="1" cellpadding="6" cellspacing="0">
<tr><th>Titel</th><th>Källa</th><th>Pris</th><th>Median</th><th>Avvikelse</th><th>Jämförbara</th><th>Länk</th></tr>
${rows}
</table>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: [EMAIL_TO],
      subject: `⛳ ${deals.length} golf-fynd minst ${DEAL_THRESHOLD_PCT}% under medianpris`,
      html,
    }),
  });
  if (!res.ok) throw new Error(`Resend-utskick misslyckades: ${res.status} ${await res.text()}`);
  console.log(`Mejl skickat till ${EMAIL_TO} med ${deals.length} fynd.`);
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY måste vara satt.");

  try {
    await runSearchAgent();
  } catch (err) {
    console.error("Sökagenten misslyckades, fortsätter ändå till flaggningssteget mot befintlig data:", err);
  }

  const newDeals = await flagUndervaluedDeals();
  console.log(`${newDeals.length} nya fynd flaggade.`);

  if (newDeals.length > 0) {
    await sendDealAlertEmail(newDeals);
  }
}

main().catch((err) => {
  console.error("Golf deal agent misslyckades:", err);
  process.exit(1);
});
