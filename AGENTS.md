<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- All app pages live under src/routes/_authenticated; store-data server functions (sheets, clients, sellers admin) require requireSupabaseAuth plus a server-side has_role admin check — sellers and unassigned users must never reach costs or clients.
- Roles live only in public.user_roles (enum app_role: admin, vendedor), checked via the has_role security-definer function; public signup is disabled and only admin server functions create accounts.
- Public storefronts (/vitrine/ and /vitrine/$slug, listPublicProducts, getSellerStorefront) must only ever return photo, model, category, sale price and the seller's name/WhatsApp/card rates — never cost, profit, margin or tax.
- Seller-facing data (restricted calculator, quotes, /orcamento/$id) comes from src/lib/quotes.functions.ts + catalog.server.ts, which only read sale price and admin-set minimums (public.product_min_prices); quotes live in public.quotes with owner RLS — why: sellers must never receive cost, profit, margin or tax.
- The admin Catalog owns client-side feed filters, pagination and modal forms, reusing saveProduct and stock-derived availability — why: presentation changes must not change Sheets row identities or server contracts.
- Printed/PDF output (the calculator proposal and the public quote page) must render inside one element carrying the .print-modal class — the proposal modal is portaled to body — because @media print hides every other body child; a fixed-position ancestor or a second printable region duplicates or blanks the PDF.
- Products live in public.products (admin-only RLS); "row" is the product id (kept from the old sheet rows, sequence-generated, never reused) — why: sellers.product_rows, min prices and quotes reference it. Public/seller reads go through src/lib/catalog.server.ts, which selects only sale fields.
- Product photos are stored in the private "product-photos" bucket as "sb:<path>" refs and served as signed URLs resolved server-side — why: the workspace blocks public buckets. Legacy data: URLs still render.
- Seller storefront: /vitrine/$slug is the home (banners from public.banners: seller-own when sellers.banner_modo="proprios" and any are live, else defaults with vendedor_id NULL; read only server-side, no anon access; featured via products.destaque) and /vitrine/$slug/produtos is the full list; /vitrine?p= stays a direct list — why: custom-selection links must skip the home.
- All price-radar data (public.radar_*) is admin-only RLS and read/written only via src/lib/radar.functions.ts with a has_role admin check; searches run one product per server call from the client loop — why: keeps each worker request short and costs/market data away from sellers and public pages.
