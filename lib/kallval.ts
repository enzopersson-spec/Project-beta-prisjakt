import { Annons } from "./types";

type Kalla = Annons["kalla"];

// Ord som tyder på kläder/mode → Sellpy & Vinted är relevanta
const KLADER_ORD = [
  "tröja", "troja", "byxor", "byxa", "jeans", "klänning", "klanning", "kjol",
  "skjorta", "jacka", "kappa", "rock", "kavaj", "kostym", "blazer",
  "skor", "sneakers", "stövlar", "stovlar", "sandaler", "boots", "loafers",
  "badbyxor", "badshorts", "bikini", "baddräkt", "baddrakt",
  "halsduk", "vantar", "vante", "mössa", "mossa", "keps", "hatt", "scarf",
  "väska", "vaska", "handväska", "handvaska", "ryggsäck", "ryggsack", "necessär",
  "plagg", "klädesplagg", "kladesplagg", "storlek", "strl",
  "t-shirt", "tshirt", "shorts", "hoodie", "collegetröja", "cardigan",
  "blus", "topp", "linne", "strumpor", "underkläder", "underklader",
  "pyjamas", "morgonrock", "bälte", "balte", "klocka", "smycke", "ring",
  "armband", "örhänge", "orhange", "halsband", "solglasögon", "solglasogon",
  "handskar", "tights", "leggings", "overall", "väst", "vast", "poncho",
  "klack", "klackar", "pumps", "gympaskor", "träningsskor", "traningsskor",
];

// Ord som tyder på fordon → Wayke är relevant
const BIL_ORD = [
  "bil", "bilar", "volvo", "bmw", "audi", "mercedes", "toyota", "volkswagen",
  "vw", "ford", "kia", "hyundai", "nissan", "peugeot", "renault", "skoda",
  "tesla", "mazda", "honda", "opel", "citroën", "citroen", "seat", "saab",
  "kombi", "sedan", "suv", "halvkombi", "cab", "cabriolet", "kaross",
  "husbil", "husvagn", "släpvagn", "slapvagn", "personbil", "diesel", "bensin",
  "årsmodell", "arsmodell", "miltal", "växellåda", "vaxellada", "automat",
];

/**
 * Väljer vilka källor som ska sökas baserat på söktermen.
 * Blocket & Tradera är generella marknadsplatser och tas alltid med.
 * Sellpy & Vinted tas bara med för kläder/mode.
 * Wayke tas bara med för fordon.
 */
export function relevantaKallor(query: string, tillgangliga: Kalla[]): Kalla[] {
  const q = query.toLowerCase();
  const matchar = (lista: string[]) => lista.some((ord) => q.includes(ord));

  const valda = new Set<Kalla>();

  // Generella marknadsplatser – alltid relevanta
  if (tillgangliga.includes("blocket")) valda.add("blocket");
  if (tillgangliga.includes("tradera")) valda.add("tradera");

  if (matchar(KLADER_ORD)) {
    if (tillgangliga.includes("sellpy")) valda.add("sellpy");
    if (tillgangliga.includes("vinted")) valda.add("vinted");
  }

  if (matchar(BIL_ORD)) {
    if (tillgangliga.includes("wayke")) valda.add("wayke");
  }

  // Skulle inget ha valts (t.ex. Blocket/Tradera avmarkerade) – sök allt tillgängligt
  if (valda.size === 0) tillgangliga.forEach((k) => valda.add(k));

  return Array.from(valda);
}
