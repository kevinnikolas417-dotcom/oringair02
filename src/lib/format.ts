export const brl = (n: number) =>
  (Number.isFinite(n) ? n : 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const pct = (n: number) => `${(Number.isFinite(n) ? n : 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
export const parseNum = (s: string) => {
  const n = Number(String(s).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const digits = (s: string) => s.replace(/\D/g, "");
export const maskCPF = (s: string) =>
  digits(s).slice(0, 11).replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
export const maskPhone = (s: string) =>
  digits(s).slice(0, 11).replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d{1,4})$/, "$1-$2");
export const maskCEP = (s: string) => digits(s).slice(0, 8).replace(/(\d{5})(\d)/, "$1-$2");
export { digits };

export const toast = (msg: string) => window.dispatchEvent(new CustomEvent("app-toast", { detail: msg }));
