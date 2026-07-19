export interface Annons {
  id: string;
  titel: string;
  pris: number | null;
  bildUrl: string | null;
  lank: string;
  plats: string | null;
  kalla: "blocket" | "tradera" | "sellpy" | "plick" | "vinted" | "wayke" | "hemnet";
  publiceradDatum: string | null;
  annonsTyp: "auktion" | "köp-nu" | null;
  relevans?: number; // semantisk likhetspoäng (0–1), sätts av sök-API:et
}

export interface SokResultat {
  annonser: Annons[];
  fel: { kalla: string; meddelande: string }[];
}
