# Gestão & Precificação Pro

Painel de gestão, precificação, catálogo de produtos, vitrine de vendedores, orçamentos, importação inteligente de listas de fornecedores e radar de preços.

## Stack

- **Framework:** TanStack Start + React 19 + TypeScript
- **Estilos:** Tailwind CSS v4 + Radix UI
- **Banco de Dados & Auth:** Supabase (PostgreSQL + RLS + Storage)
- **Deploy:** Vercel (via Nitro preset `vercel`)

## Desenvolvimento Local

```sh
npm install
cp .env.example .env
npm run dev
```

## Deploy na Vercel

1. Importe este repositório na Vercel.
2. Configure as variáveis de ambiente listadas em `.env.example` nas configurações do projeto na Vercel.
3. No painel do Supabase (**Authentication → URL Configuration**):
   - Defina **Site URL** como o domínio do site na Vercel (ex.: `https://seu-projeto.vercel.app`).
   - Adicione `https://seu-projeto.vercel.app/reset-password` em **Redirect URLs**.
4. Aplique as migrations SQL da pasta `drizzle/migrations/` no banco Supabase.

## Scripts

- `npm run dev` — inicia o servidor de desenvolvimento
- `npm run build` — gera o build de produção para a Vercel
- `npm test` — executa os testes unitários (Vitest)
- `npm run lint` — executa o ESLint
