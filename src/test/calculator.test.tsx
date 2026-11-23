import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Calculator } from "@/components/Calculator";
import { brl as formatBrl } from "@/lib/format";

const brl = (value: number) => formatBrl(value).replace(/\s/g, " ");

afterEach(cleanup);

describe("Admin calculator sales tax display", () => {
  it("shows tax on the suggested sale price without changing existing totals", () => {
    render(<Calculator products={[]} onSendToCatalog={vi.fn()} />);
    const tax = screen.getByText("Imposto sobre venda").parentElement;
    expect(tax).toHaveTextContent(brl(5395 * 0.015));
    expect(screen.getByText("Custo total").parentElement).toHaveTextContent(brl(5095));
    expect(screen.getByText("Lucro", { exact: true }).parentElement).toHaveTextContent(brl(300));
  });

  it("updates when sale price or tax percentage changes and falls back when price is cleared", () => {
    render(<Calculator products={[]} onSendToCatalog={vi.fn()} />);
    const price = screen.getByLabelText("Preço de venda (R$) · opcional");
    const tax = screen.getByText("Imposto sobre venda").parentElement;
    fireEvent.change(price, { target: { value: "6000" } });
    expect(tax).toHaveTextContent(brl(90));
    fireEvent.change(screen.getByLabelText("Imposto %"), { target: { value: "2" } });
    expect(tax).toHaveTextContent(brl(120));
    fireEvent.change(price, { target: { value: "" } });
    expect(tax).toHaveTextContent(brl(5420 * 0.02));
  });
});

describe("Admin calculator entrada (down payment)", () => {
  it("shows entrada and saldo restante, computing installments over the saldo", () => {
    render(<Calculator products={[]} onSendToCatalog={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Entrada (R$) · opcional"), { target: { value: "500" } });
    expect(screen.getByText("Entrada").parentElement).toHaveTextContent(brl(500));
    expect(screen.getByText("Saldo restante no Pix").parentElement).toHaveTextContent(brl(4895));
    // 1x total = saldo / (1 - 3.2%)
    expect(screen.getByText(/parcelas calculadas sobre o saldo/)).toHaveTextContent(brl(4895));
  });

  it("warns and keeps full-price behavior when entrada reaches the price", () => {
    render(<Calculator products={[]} onSendToCatalog={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Entrada (R$) · opcional"), { target: { value: "9999" } });
    expect(screen.getByText("A entrada deve ser menor que o valor do aparelho")).toBeInTheDocument();
    expect(screen.queryByText("Saldo restante no Pix")).toBeNull();
  });

  it("does not send entrada to the catalog draft", () => {
    const onSend = vi.fn();
    render(<Calculator products={[]} onSendToCatalog={onSend} />);
    fireEvent.change(screen.getByLabelText("Entrada (R$) · opcional"), { target: { value: "500" } });
    fireEvent.click(screen.getByText("Salvar no catálogo"));
    expect(onSend).toHaveBeenCalledWith(expect.not.objectContaining({ entrada: expect.anything() }));
  });
});