import { describe, expect, it } from "vitest";
import type { Product } from "@/lib/sheets.functions";
import {
  buildAliasKey,
  canonicalColorSet,
  matchImportedItem,
  mergeImportedVariants,
  mergeVariacaoLabel,
  normalizeProductText,
} from "@/lib/product-matching";

const mkProduct = (row: number, modelo: string, variacao = "", variants: Product["variants"] = []): Product => ({
  row,
  modelo,
  variacao,
  custo: 5000,
  venda: 5800,
  estoque: 1,
  foto: "",
  fotoRef: "",
  lucroTipo: "fixo",
  lucro: 500,
  categoria: "iPhone 17",
  categoriaPai: "Celulares",
  destaque: false,
  variants,
});

describe("product recognition & matching", () => {
  it("normalizes storage units, e-sim and accents consistently", () => {
    expect(normalizeProductText("iPhone 17 Pro Max 512 GB E-sim")).toBe("iphone 17 pro max 512gb esim");
    expect(normalizeProductText("iPhone 17 Pro Max 512gb eSIM")).toBe("iphone 17 pro max 512gb esim");
    expect(normalizeProductText("Apple Watch Ultra 2 49 mm")).toBe("apple watch ultra 2 49mm");
  });

  it("canonicalizes color lists regardless of order, language, or titanium prefix", () => {
    expect(canonicalColorSet("Branco, Azul")).toEqual(["azul", "branco"]);
    expect(canonicalColorSet("Blue / White")).toEqual(["azul", "branco"]);
    expect(canonicalColorSet("Titânio Preto, Titânio Deserto")).toEqual(["deserto", "preto"]);
    expect(canonicalColorSet("Black / Desert Titanium")).toEqual(["deserto", "preto"]);
  });

  it("recognizes products with different spacing, color order, or PT/EN colors", () => {
    const catalog = [
      mkProduct(2, "iPhone 17 Pro Max 512GB E-sim", "Azul, Branco"),
      mkProduct(3, "iPhone 16 Pro 256GB", "Titânio Preto"),
    ];

    const r1 = matchImportedItem({ nome: "iPhone 17 Pro Max 512 GB e-SIM", cores: "Branco, Azul" }, catalog);
    expect(r1.product?.row).toBe(2);
    expect(r1.matchType).toBe("exact");

    const r2 = matchImportedItem({ nome: "iPhone 16 Pro 256 GB", cores: "Black" }, catalog);
    expect(r2.product?.row).toBe(3);
    expect(r2.matchType).toBe("exact");
  });

  it("recognizes products via learned database aliases", () => {
    const catalog = [mkProduct(5, "Apple Watch Ultra 2 49mm GPS + Celular", "Titânio Natural")];
    const aliases = [
      {
        aliasKey: buildAliasKey("Watch Ultra 2 49mm", "Natural"),
        productRow: 5,
        rawNome: "Watch Ultra 2 49mm",
        rawCores: "Natural",
      },
    ];

    const res = matchImportedItem({ nome: "Watch Ultra 2 49 mm", cores: "Titânio Natural" }, catalog, aliases);
    expect(res.product?.row).toBe(5);
    expect(res.matchType).toBe("alias");
  });

  it("recognizes model when supplier sends a subset of colors or per-color price rows", () => {
    const catalog = [
      mkProduct(10, "iPhone 17 Pro Max 512GB E-sim", "Laranja, Branco, Azul", [
        { cor: "Laranja", corHex: "#ea580c", custo: 8000, lucro: 500, preco: 8600, imagem: null, disponivel: true },
        { cor: "Branco", corHex: "#f9fafb", custo: 8200, lucro: 500, preco: 8800, imagem: null, disponivel: true },
        { cor: "Azul", corHex: "#2563eb", custo: 8200, lucro: 500, preco: 8800, imagem: null, disponivel: true },
      ]),
    ];

    const r1 = matchImportedItem({ nome: "iPhone 17 Pro Max 512GB E-sim", cores: "Laranja" }, catalog);
    expect(r1.product?.row).toBe(10);
    expect(r1.matchType).toBe("variant");

    const r2 = matchImportedItem({ nome: "iPhone 17 Pro Max 512GB E-sim", cores: "Branco, Azul" }, catalog);
    expect(r2.product?.row).toBe(10);
    expect(r2.matchType).toBe("variant");
  });

  it("NEVER confuses different storage, generation, tier, CPO or e-SIM specs", () => {
    const catalog = [
      mkProduct(2, "iPhone 16 Pro 256GB", "Preto"),
      mkProduct(3, "iPhone 16 128GB", "Preto"),
      mkProduct(4, "iPhone 17 Pro Max 512GB E-sim", "Laranja"),
    ];

    // Different storage
    expect(matchImportedItem({ nome: "iPhone 16 Pro 512GB", cores: "Preto" }, catalog).product).toBeUndefined();
    // Different tier (Pro vs Pro Max)
    expect(matchImportedItem({ nome: "iPhone 16 Pro Max 256GB", cores: "Preto" }, catalog).product).toBeUndefined();
    // Different generation (15 vs 16)
    expect(matchImportedItem({ nome: "iPhone 15 128GB", cores: "Preto" }, catalog).product).toBeUndefined();
    // CPO vs new
    expect(matchImportedItem({ nome: "iPhone 16 Pro 256GB CPO", cores: "Preto" }, catalog).product).toBeUndefined();
    // e-SIM vs non-e-SIM
    expect(matchImportedItem({ nome: "iPhone 17 Pro Max 512GB", cores: "Laranja" }, catalog).product).toBeUndefined();
  });

  it("merges imported color variants preserving untouched colors and adding new ones", () => {
    const existing = [
      { cor: "Laranja", corHex: "#ea580c", custo: 8000, lucro: 500, preco: 8600, imagem: null, disponivel: true },
      { cor: "Branco", corHex: "#f9fafb", custo: 8200, lucro: 500, preco: 8800, imagem: null, disponivel: false },
    ];

    const merged = mergeImportedVariants(existing, "Branco, Azul", 7900, 500, 8550)!;
    expect(merged).toHaveLength(3);
    expect(merged[0]).toMatchObject({ cor: "Laranja", custo: 8000, preco: 8600 });
    expect(merged[1]).toMatchObject({ cor: "Branco", custo: 7900, preco: 8550, disponivel: true });
    expect(merged[2]).toMatchObject({ cor: "Azul", custo: 7900, preco: 8550, disponivel: true });

    expect(mergeVariacaoLabel("Laranja, Branco", "Branco, Azul")).toBe("Laranja, Branco, Azul");
  });
});
