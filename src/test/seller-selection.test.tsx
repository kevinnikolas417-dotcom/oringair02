import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { Sellers } from "@/components/Sellers";
import type { Product } from "@/lib/sheets.functions";

const mocks = vi.hoisted(() => ({ update: vi.fn().mockResolvedValue({ ok: true }), list: vi.fn().mockResolvedValue([{ id: "seller-1", nome: "João", email: "", whatsapp: "", slug: "joao", active: true, product_rows: [3], categorias: [], rates: "" }]) }));
vi.mock("@/lib/sellers.functions", () => ({ listSellers: mocks.list, updateSeller: mocks.update, createSeller: vi.fn(), resetSellerPassword: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/format", () => ({ maskPhone: (v: string) => v, toast: vi.fn() }));
const products = [
  { row: 2, modelo: "iPhone", categoriaPai: "Apple", foto: "", variacao: "" },
  { row: 3, modelo: "Redmi", categoriaPai: "Xiaomi", foto: "", variacao: "" },
] as Product[];
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("selects and saves only Apple products when Apple is chosen", async () => {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><Sellers products={products} /></QueryClientProvider>);
  fireEvent.click(await screen.findByRole("button", { name: "Produtos" }));
  fireEvent.click(screen.getByRole("button", { name: "Apple" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar todos" }));
  fireEvent.click(screen.getByRole("button", { name: "Salvar catálogo" }));
  await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ data: expect.objectContaining({ product_rows: [2], categorias: ["Apple"] }) }));
});