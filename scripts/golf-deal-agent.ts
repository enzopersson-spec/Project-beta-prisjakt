/**
 * Söker golfklubbor på Blocket, låter en Claude-agent normalisera märke/modell/typ
 * per annons, sparar allt i Supabase (golf_listings), flaggar annonser som ligger
 * >= GOLF_DEAL_THRESHOLD_PCT % under gruppens medianpris (flagged_deals) och mejlar
 * en sammanfattning via Resend.
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
 *   GOLF_SEARCH_QUERIES      kommaseparerad lista, se DEFAULT_SEARCH_QUERIES
 *   GOLF_DEAL_THRESHOLD_PCT  default 25
 *   GOLF_MIN_GROUP_SIZE      default 3 (färre jämförbara annonser ger ingen median värd namnet)
 *   GOLF_LISTING_MAX_AGE_DAYS default 14 (äldre annonser räknas inte in i medianen)
 *   CURRENCY_TO_SEK_JSON     valfri override, t.ex. {"USD":10.8,"EUR":11.3,"GBP":13.2}
 */

import { query, tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { sokBlocket } from "../lib/scrapers/blocket";

const CLUB_TYPES = ["driver", "fairway_wood", "hybrid", "irons", "wedge", "putter", "bag", "other"] as const;
type ClubType = (typeof CLUB_TYPES)[number];
type Currency = "SEK" | "USD" | "EUR" | "GBP";
type Platform = "blocket";

const DEFAULT_SEARCH_QUERIES = [
  "golfklubbor",
  "golf driver",
  "golf järnset irons",
  "golf putter",
  "golf wedge",
  "golf hybrid",
];

// GitHub Actions sätter env-variabeln till "" (inte undefined) när en refererad
// secret inte finns i repot, så en vanlig ?? "" fallback fångar aldrig det fallet.
function envOrDefault(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value ? value : fallback;
}

const SEARCH_QUERIES = (process.env.GOLF_SEARCH_QUERIES?.split(",").map((s) => s.trim()).filter(Boolean)) ?? DEFAULT_SEARCH_QUERIES;
const DEAL_THRESHOLD_PCT = Number(process.env.GOLF_DEAL_THRESHOLD_PCT ?? 25);
const MIN_GROUP_SIZE = Number(process.env.GOLF_MIN_GROUP_SIZE ?? 3);
const MAX_AGE_DAYS = Number(process.env.GOLF_LISTING_MAX_AGE_DAYS ?? 14);
const EMAIL_TO = envOrDefault("GOLF_DEAL_EMAIL_TO", "enzo.persson@hotmail.com");
const EMAIL_FROM = envOrDefault("RESEND_FROM_EMAIL", "Golf Deal Agent <onboarding@resend.dev>");

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

interface RawCandidate {
  platform: Platform;
  listing_url: string;
  title?: string;
  price?: number;
  currency?: Currency;
  condition?: string;
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

// ---- Supabase-skrivning ----

const NormalizedListing = z.object({
  platform: z.enum(["blocket"]),
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
  tools: [searchBlocketTool, saveListingsTool],
});

async function runSearchAgent() {
  const clubTypeList = CLUB_TYPES.join(", ");
  const prompt = `Du ska hitta golfklubbor till salu och spara normaliserade annonser i en databas.

Sökfraser att gå igenom, en i taget:
${SEARCH_QUERIES.map((q) => `- ${q}`).join("\n")}

För varje sökfras:
1. Anropa search_blocket med sökfrasen.
2. Gå igenom kandidaterna. Hoppa över allt som uppenbart inte är en golfklubba (t.ex. golfskor, golfbollar, resor).
3. För varje golfklubb-annons: avgör brand (märke, t.ex. "Callaway", "TaylorMade", "Titleist", "Ping", "Mizuno"),
   model (specifik modell, t.ex. "Stealth 2", "Rogue ST Max", "T100") och club_type (ett av: ${clubTypeList}).
   Om märke eller modell inte går att avgöra med rimlig säkerhet, sätt brand/model till null istället för att gissa.
4. Anropa save_listings med den normaliserade batchen för den sökfrasen. Låt price/currency vara exakt de värden
   du fick från search_blocket.

Svara till sist med en kort textsammanfattning (inga fler verktygsanrop) av hur många annonser du sparade totalt.`;

  const maxTurns = Math.max(40, SEARCH_QUERIES.length * 10);

  for await (const message of query({
    prompt,
    options: {
      model: process.env.GOLF_AGENT_MODEL?.trim() || undefined,
      maxTurns,
      permissionMode: "bypassPermissions",
      allowedTools: ["mcp__golf-deals__search_blocket", "mcp__golf-deals__save_listings"],
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

  return candidates.filter((c) => !flaggedIds.has(c.listing_id));
}

// Skrivs bara efter att notifieringen (mejlet) faktiskt gått iväg, så att ett
// mejlfel inte tyst begraver ett fynd för gott – nästa körning försöker då igen.
async function markDealsNotified(deals: FlaggedDeal[]) {
  const supabase = supabaseClient();
  const { error } = await supabase.from("flagged_deals").insert(
    deals.map((d) => ({
      listing_id: d.listing_id,
      group_median: d.group_median,
      comparable_count: d.comparable_count,
      deviation_pct: d.deviation_pct,
    }))
  );
  if (error) throw error;
}

async function sendDealAlertEmail(deals: FlaggedDeal[]): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("RESEND_API_KEY saknas, hoppar över mejl.");
    return false;
  }

  const subject =
    deals.length > 0
      ? `⛳ ${deals.length} golf-fynd minst ${DEAL_THRESHOLD_PCT}% under medianpris`
      : `⛳ Golf Deal Agent – inga nya fynd denna körning`;

  const html =
    deals.length > 0
      ? `<h2>${subject}</h2>
<table border="1" cellpadding="6" cellspacing="0">
<tr><th>Titel</th><th>Källa</th><th>Pris</th><th>Median</th><th>Avvikelse</th><th>Jämförbara</th><th>Länk</th></tr>
${deals
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
  .join("\n")}
</table>`
      : `<h2>${subject}</h2><p>Sökningen kördes utan att hitta några nya fynd minst ${DEAL_THRESHOLD_PCT}% under gruppens medianpris.</p>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: [EMAIL_TO],
      subject,
      html,
    }),
  });
  if (!res.ok) throw new Error(`Resend-utskick misslyckades: ${res.status} ${await res.text()}`);
  console.log(`Mejl skickat till ${EMAIL_TO} med ${deals.length} fynd.`);
  return true;
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY måste vara satt.");

  try {
    await runSearchAgent();
  } catch (err) {
    console.error("Sökagenten misslyckades, fortsätter ändå till flaggningssteget mot befintlig data:", err);
  }

  const newDeals = await flagUndervaluedDeals();
  console.log(`${newDeals.length} nya fynd hittade.`);

  const sent = await sendDealAlertEmail(newDeals);
  if (sent && newDeals.length > 0) await markDealsNotified(newDeals);
}

main().catch((err) => {
  console.error("Golf deal agent misslyckades:", err);
  process.exit(1);
});
