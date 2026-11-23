import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Catalog } from "@/components/Catalog";
import type { Product } from "@/lib/sheets.functions";

const save = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => save }));
vi.mock("@/lib/sheets.functions", () => ({ saveProduct: {}, deleteProduct: {} }));
vi.mock("@/lib/import.functions", () => ({ parseSupplierList: {}, listProductAliases: {}, saveImportMetadata: {} }));
vi.mock("@/lib/images.functions", () => ({ findProductImages: {}, saveLibraryImage: {} }));
const products: Product[] = Array.from({ length: 25 }, (_, i) => ({ row: i + 2, modelo: `Aparelho ${i + 1}`, variacao: "", custo: 100, venda: 200, estoque: 1, foto: "", fotoRef: "", lucroTipo: "fixo", lucro: 50, categoria: i < 10 ? "iPhone" : "Samsung", categoriaPai: "", destaque: false, variants: [] }));
const mount = (extra = {}) => render(<Catalog products={products} draft={null} refreshing={false} onChanged={vi.fn()} onUse={vi.fn()} {...extra} />);
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Admin catalog feed", () => {
  it("renders 20 cards per page and filters by category and debounced search", async () => {
    mount();
    expect(document.querySelectorAll("article")).toHaveLength(20);
    expect(screen.queryByText("Aparelho 21")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "iPhone" }));
    expect(document.querySelectorAll("article")).toHaveLength(10);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "APARELHO 9" } });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 250)); });
    expect(document.querySelectorAll("article")).toHaveLength(1);
    expect(screen.getByText("Aparelho 9")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Limpar busca" }));
    expect(document.querySelectorAll("article")).toHaveLength(10);
  });
  it("opens a populated edit modal without saving", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: /^Editar Aparelho 1$/ }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Aparelho 1")).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });
  it("opens the new product form and rejects invalid values", () => {
    mount({ products: [] });
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar primeiro produto" }));
    const modal = screen.getByRole("dialog");
    fireEvent.change(within(modal).getByLabelText("Modelo do aparelho"), { target: { value: "Teste" } });
    fireEvent.change(within(modal).getByLabelText("Custo R$"), { target: { value: "-10" } });
    fireEvent.change(within(modal).getByLabelText("Preço de venda R$"), { target: { value: "200" } });
    fireEvent.submit(modal.querySelector("form") as HTMLFormElement);
    expect(save).not.toHaveBeenCalled();
  });
  it("shows skeletons while loading instead of the empty state", () => {
    mount({ products: [], loading: true });
    expect(screen.getAllByLabelText("Carregando produto")).toHaveLength(8);
    expect(screen.queryByText("Seu catálogo está vazio")).not.toBeInTheDocument();
  });
});