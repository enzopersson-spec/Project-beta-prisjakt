import { pipeline, env, type FeatureExtractionPipeline } from "@xenova/transformers";

// Kör helt lokalt – ladda inga fjärrmodeller efter första nedladdningen
env.allowLocalModels = true;

// Flerspråkig modell byggd för sökning (stödjer svenska). ~110 MB, laddas ner en gång.
const MODELL = "Xenova/multilingual-e5-small";

let pipelinePromise: Promise<FeatureExtractionPipeline> | null = null;

// Ladda modellen en gång och återanvänd (singleton)
function hamtaPipeline(): Promise<FeatureExtractionPipeline> {
  if (!pipelinePromise) {
    pipelinePromise = pipeline("feature-extraction", MODELL) as Promise<FeatureExtractionPipeline>;
  }
  return pipelinePromise;
}

// Skapa normaliserade vektorer för en lista texter
async function baddaIn(texter: string[]): Promise<number[][]> {
  const pipe = await hamtaPipeline();
  const output = await pipe(texter, { pooling: "mean", normalize: true });
  return output.tolist() as number[][];
}

// Cosinuslikhet mellan två normaliserade vektorer = skalärprodukt
function likhet(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

/**
 * Beräknar semantisk likhet mellan en sökfråga och en lista titlar.
 * e5-modellen kräver prefixen "query:" och "passage:".
 * Returnerar en likhetspoäng (0–1) per titel, i samma ordning.
 */
export async function likhetsPoang(query: string, titlar: string[]): Promise<number[]> {
  if (titlar.length === 0) return [];
  const alla = await baddaIn([`query: ${query}`, ...titlar.map((t) => `passage: ${t}`)]);
  const fragaVektor = alla[0];
  return alla.slice(1).map((v) => likhet(fragaVektor, v));
}
