import type { Product, Variant } from "./sheets.functions";

export type ProductAlias = {
  aliasKey: string;
  productRow: number;
  rawNome: string;
  rawCores: string;
};

export type MatchType = "alias" | "exact" | "variant" | "fuzzy" | "none";

export type MatchResult = {
  product?: Product;
  matchType: MatchType;
  score: number;
};

export function normalizeProductText(input: string): string {
  return (input ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\be[\s-]+sim\b/g, "esim")
    .replace(/(\d+)\s*(gb|tb|mm|hz|w)\b/g, "$1$2")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const COLOR_SYNONYMS: Record<string, string> = {
  black: "preto",
  preto: "preto",
  preta: "preto",
  midnight: "preto",
  "meia noite": "preto",
  "jet black": "preto",
  "space black": "preto",
  "preto espacial": "preto",
  obsidian: "preto",
  white: "branco",
  branco: "branco",
  branca: "branco",
  starlight: "branco",
  estelar: "branco",
  silver: "prata",
  prata: "prata",
  prateado: "prata",
  prateada: "prata",
  blue: "azul",
  azul: "azul",
  ultramarine: "azul",
  ultramarino: "azul",
  "deep blue": "azul",
  "azul profundo": "azul",
  "sky blue": "azul",
  "azul ceu": "azul",
  "mist blue": "azul",
  orange: "laranja",
  laranja: "laranja",
  "cosmic orange": "laranja",
  "laranja cosmico": "laranja",
  gold: "dourado",
  dourado: "dourado",
  dourada: "dourado",
  ouro: "dourado",
  desert: "deserto",
  deserto: "deserto",
  natural: "natural",
  green: "verde",
  verde: "verde",
  teal: "verde",
  sage: "verde",
  pink: "rosa",
  rosa: "rosa",
  rose: "rosa",
  "rose gold": "rosa",
  purple: "roxo",
  roxo: "roxo",
  roxa: "roxo",
  lilas: "roxo",
  lavender: "roxo",
  lavanda: "roxo",
  red: "vermelho",
  vermelho: "vermelho",
  vermelha: "vermelho",
  yellow: "amarelo",
  amarelo: "amarelo",
  amarela: "amarelo",
  gray: "cinza",
  grey: "cinza",
  cinza: "cinza",
  "space gray": "cinza",
  "space grey": "cinza",
  "cinza espacial": "cinza",
  graphite: "cinza",
  grafite: "cinza",
  unica: "",
  unico: "",
  padrao: "",
};

const COLOR_HEX: Record<string, string> = {
  preto: "#1f2937",
  branco: "#f9fafb",
  prata: "#d1d5db",
  azul: "#2563eb",
  laranja: "#ea580c",
  dourado: "#d4af37",
  deserto: "#c2a385",
  natural: "#b8b2a6",
  verde: "#16a34a",
  rosa: "#ec4899",
  roxo: "#9333ea",
  vermelho: "#dc2626",
  amarelo: "#eab308",
  cinza: "#6b7280",
};

export function splitColorNames(raw: string): string[] {
  return (raw ?? "")
    .split(/\s*[,;/|]\s*|\s+e\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function canonicalizeColor(raw: string): string {
  const cleaned = normalizeProductText(raw)
    .replace(/\b(titanio|titanium|aluminio|aluminum|aco|steel)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  if (cleaned in COLOR_SYNONYMS) return COLOR_SYNONYMS[cleaned]!;
  for (const [k, v] of Object.entries(COLOR_SYNONYMS)) {
    if (k.includes(" ") && cleaned.includes(k)) return v;
  }
  const firstWord = cleaned.split(" ")[0] ?? "";
  if (firstWord in COLOR_SYNONYMS) return COLOR_SYNONYMS[firstWord]!;
  return cleaned;
}

export function canonicalColorSet(raw: string): string[] {
  const set = new Set<string>();
  for (const part of splitColorNames(raw)) {
    const c = canonicalizeColor(part);
    if (c) set.add(c);
  }
  return [...set].sort();
}

export function guessColorHex(cor: string): string {
  const c = canonicalizeColor(cor);
  return COLOR_HEX[c] ?? "#d1d5db";
}

export function buildAliasKey(nome: string, cores = ""): string {
  const base = normalizeProductText(nome);
  const colorList = canonicalColorSet(cores);
  return colorList.length ? `${base}::${colorList.join(",")}` : base;
}

const TIER_MODIFIERS = new Set(["pro", "max", "plus", "mini", "air", "ultra", "se", "fe", "neo", "lite", "cpo"]);
const CONN_MODIFIERS = new Set(["esim", "anatel", "cellular", "celular", "wifi", "5g", "4g"]);
const STOP_WORDS = new Set(["apple", "novo", "lacrado", "garantia", "original", "de", "com", "para", "e"]);

type ProductSpecs = {
  storage: string[];
  sizeMm: string[];
  tiers: Set<string>;
  conn: Set<string>;
  modelNumbers: Set<string>;
  tokens: Set<string>;
};

export function extractProductSpecs(raw: string): ProductSpecs {
  const norm = normalizeProductText(raw);
  const rawTokens = norm ? norm.split(" ") : [];
  const storage = new Set<string>();
  const sizeMm = new Set<string>();
  const tiers = new Set<string>();
  const conn = new Set<string>();
  const modelNumbers = new Set<string>();
  const tokens = new Set<string>();

  for (const t of rawTokens) {
    if (/^\d+(?:gb|tb)$/.test(t)) {
      storage.add(t);
      tokens.add(t);
      continue;
    }
    if (/^\d+mm$/.test(t)) {
      sizeMm.add(t);
      tokens.add(t);
      continue;
    }
    if (TIER_MODIFIERS.has(t)) {
      tiers.add(t);
      tokens.add(t);
      continue;
    }
    if (CONN_MODIFIERS.has(t)) {
      const normalizedConn = t === "celular" ? "cellular" : t;
      conn.add(normalizedConn);
      tokens.add(normalizedConn);
      continue;
    }
    if (/^(?:\d{1,2}|m\d|s\d{1,2}|a\d{1,2})$/.test(t)) {
      modelNumbers.add(t);
      tokens.add(t);
      continue;
    }
    if (!STOP_WORDS.has(t)) {
      tokens.add(t);
    }
  }

  return {
    storage: [...storage].sort(),
    sizeMm: [...sizeMm].sort(),
    tiers,
    conn,
    modelNumbers,
    tokens,
  };
}

function sameSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

function sameArray(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function specsCompatible(a: ProductSpecs, b: ProductSpecs): boolean {
  if ((a.storage.length > 0 || b.storage.length > 0) && !sameArray(a.storage, b.storage)) return false;
  if ((a.sizeMm.length > 0 || b.sizeMm.length > 0) && !sameArray(a.sizeMm, b.sizeMm)) return false;
  if (!sameSet(a.tiers, b.tiers)) return false;
  if (!sameSet(a.modelNumbers, b.modelNumbers)) return false;
  if (a.conn.has("esim") !== b.conn.has("esim")) return false;
  if (a.conn.has("anatel") !== b.conn.has("anatel")) return false;
  return true;
}

function diceSimilarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return (2 * inter) / (a.size + b.size);
}

function productColorSet(p: Product): string[] {
  const fromVar = canonicalColorSet(p.variacao);
  const set = new Set<string>(fromVar);
  for (const v of p.variants ?? []) {
    const c = canonicalizeColor(v.cor);
    if (c) set.add(c);
  }
  return [...set].sort();
}

function colorsOverlap(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const setB = new Set(b);
  let hits = 0;
  for (const c of a) if (setB.has(c)) hits++;
  return hits;
}

export function matchImportedItem(
  item: { nome: string; cores: string },
  products: Product[],
  aliases: ProductAlias[] = [],
): MatchResult {
  const byRow = new Map<number, Product>(products.map((p) => [p.row, p]));
  const aliasMap = new Map<string, Product>();
  for (const a of aliases) {
    const p = byRow.get(a.productRow);
    if (p) aliasMap.set(a.aliasKey, p);
  }

  const itemModelNorm = normalizeProductText(item.nome);
  const itemColors = canonicalColorSet(item.cores);
  const fullAliasKey = buildAliasKey(item.nome, item.cores);
  const sqlSeedKey = normalizeProductText([item.nome, item.cores].filter(Boolean).join(" "));

  // Tier 1: Learned database alias
  const aliasHit =
    aliasMap.get(fullAliasKey) ??
    aliasMap.get(sqlSeedKey) ??
    (!itemColors.length ? aliasMap.get(itemModelNorm) : undefined);
  if (aliasHit) {
    return { product: aliasHit, matchType: "alias", score: 1 };
  }

  // Tier 2: Exact canonical model + exact canonical color set
  const exactModelMatches = products.filter((p) => normalizeProductText(p.modelo) === itemModelNorm);
  for (const p of exactModelMatches) {
    const pColors = productColorSet(p);
    if (sameArray(pColors, itemColors)) {
      return { product: p, matchType: "exact", score: 1 };
    }
  }

  // Also check full normalized string (modelo + variacao) === (nome + cores)
  if (sqlSeedKey) {
    const fullExact = products.find(
      (p) => normalizeProductText([p.modelo, p.variacao].filter(Boolean).join(" ")) === sqlSeedKey,
    );
    if (fullExact) {
      return { product: fullExact, matchType: "exact", score: 0.99 };
    }
  }

  // Tier 3: Exact canonical model + color overlap or single-model catalog entry
  if (exactModelMatches.length > 0) {
    if (itemColors.length > 0) {
      let bestOverlap: { p: Product; hits: number } | undefined;
      for (const p of exactModelMatches) {
        const hits = colorsOverlap(itemColors, productColorSet(p));
        if (hits > 0 && (!bestOverlap || hits > bestOverlap.hits)) {
          bestOverlap = { p, hits };
        }
      }
      if (bestOverlap) {
        return { product: bestOverlap.p, matchType: "variant", score: 0.95 };
      }
    }
    if (exactModelMatches.length === 1) {
      const only = exactModelMatches[0]!;
      const onlyColors = productColorSet(only);
      // If product uses variants or has no colors set (or imported item has no colors), match the single model
      if (!onlyColors.length || !itemColors.length || (only.variants && only.variants.length > 0)) {
        return { product: only, matchType: "variant", score: 0.9 };
      }
    }
  }

  // Tier 4: Spec-guarded fuzzy token match
  const itemSpecs = extractProductSpecs(item.nome);
  let bestFuzzy: { p: Product; score: number; colorHits: number } | undefined;

  for (const p of products) {
    const pSpecs = extractProductSpecs(p.modelo);
    if (!specsCompatible(itemSpecs, pSpecs)) continue;
    const sim = diceSimilarity(itemSpecs.tokens, pSpecs.tokens);
    if (sim < 0.78) continue;

    const pColors = productColorSet(p);
    const hits = colorsOverlap(itemColors, pColors);
    const exactColorBonus = sameArray(itemColors, pColors) ? 0.08 : hits > 0 ? 0.04 : 0;
    const totalScore = Math.min(0.94, sim + exactColorBonus);

    // If both have distinct non-overlapping colors and there are multiple models, don't force mismatch
    if (itemColors.length > 0 && pColors.length > 0 && hits === 0 && !(p.variants && p.variants.length > 0)) {
      continue;
    }

    if (
      !bestFuzzy ||
      totalScore > bestFuzzy.score ||
      (totalScore === bestFuzzy.score && hits > bestFuzzy.colorHits)
    ) {
      bestFuzzy = { p, score: totalScore, colorHits: hits };
    }
  }

  if (bestFuzzy) {
    return { product: bestFuzzy.p, matchType: "fuzzy", score: Number(bestFuzzy.score.toFixed(2)) };
  }

  return { matchType: "none", score: 0 };
}

export function mergeImportedVariants(
  existing: Variant[],
  importedCores: string,
  custo: number,
  lucro: number,
  preco: number,
): Variant[] | undefined {
  const names = splitColorNames(importedCores);
  if (!existing.length && !names.length) return undefined;

  const updated = existing.map((v) => ({ ...v }));
  if (!names.length) {
    return updated.map((v) => ({ ...v, custo, lucro, preco, disponivel: true }));
  }

  const matchedCanon = new Set<string>();
  for (const name of names) {
    const canon = canonicalizeColor(name);
    if (!canon) continue;
    matchedCanon.add(canon);
    const idx = updated.findIndex((v) => canonicalizeColor(v.cor) === canon);
    if (idx >= 0) {
      updated[idx] = { ...updated[idx]!, custo, lucro, preco, disponivel: true };
    } else {
      updated.push({
        cor: name,
        corHex: guessColorHex(name),
        custo,
        lucro,
        preco,
        imagem: null,
        disponivel: true,
      });
    }
  }

  return updated;
}

export function mergeVariacaoLabel(existingVariacao: string, importedCores: string): string {
  const existingNames = splitColorNames(existingVariacao);
  const importedNames = splitColorNames(importedCores);
  if (!importedNames.length) return existingVariacao;
  if (!existingNames.length) return importedNames.join(", ");

  const seen = new Set(existingNames.map((n) => canonicalizeColor(n) || normalizeProductText(n)));
  const merged = [...existingNames];
  for (const name of importedNames) {
    const key = canonicalizeColor(name) || normalizeProductText(name);
    if (key && !seen.has(key)) {
      seen.add(key);
      merged.push(name);
    }
  }
  return merged.join(", ");
}
