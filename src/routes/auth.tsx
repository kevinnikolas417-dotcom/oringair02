import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { publicOrigin } from "@/lib/publicUrl";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Gestão & Precificação Pro" },
      { name: "description", content: "Acesse o painel de precificação, clientes e catálogo da sua loja." },
      { property: "og:title", content: "Entrar — Gestão & Precificação Pro" },
      { property: "og:description", content: "Acesse o painel da sua loja de celulares." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

type Mode = "login" | "forgot";

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { if (data.session) navigate({ to: "/", replace: true }); });
    const { data } = supabase.auth.onAuthStateChange((e, s) => {
      if (e === "SIGNED_IN" && s) navigate({ to: "/", replace: true });
    });
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setBusy(true); setMsg(null);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const origin = publicOrigin() || window.location.origin;
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/reset-password` });
        if (error) throw error;
        setMsg({ ok: true, text: "Enviamos um link para redefinir sua senha no seu e-mail." });
      }
    } catch (err) {
      const t = err instanceof Error ? err.message : "Erro";
      setMsg({ ok: false, text: t.includes("Invalid login") ? "E-mail ou senha incorretos." : t });
    }
    setBusy(false);
  };

  const titles = { login: "Entrar", forgot: "Esqueci minha senha" };

  return (
    <div className="gridbg grid min-h-screen place-items-center bg-ground px-4 text-ink">
      <div className="w-full max-w-sm rounded-xl bg-panel2 ring-1 ring-line">
        <div className="flex items-center gap-3 border-b border-line px-5 py-4">
          <div className="grid size-9 place-items-center rounded-lg bg-acid/10 ring-1 ring-acid/25"><span className="font-mono text-sm font-semibold text-acid">G&amp;P</span></div>
          <div className="leading-none">
            <span className="block text-sm font-semibold tracking-tight">Gestão &amp; Precificação <span className="text-acid">Pro</span></span>
            <span className="mt-1 block font-mono text-[11px] text-dim">{titles[mode]}</span>
          </div>
        </div>
        <form onSubmit={submit} className="grid gap-3 p-5">
          <label><span className="label-mono">E-mail</span>
            <input className="field" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          {mode === "login" && (
            <label><span className="label-mono">Senha</span>
              <input className="field" type="password" required minLength={6} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          )}
          {msg && <p className={`font-mono text-[11px] ${msg.ok ? "text-acid" : "text-destructive"}`}>{msg.text}</p>}
          <button disabled={busy} className="btn-acid mt-1">{busy ? "Aguarde…" : mode === "login" ? "Entrar" : "Enviar link"}</button>
          <div className="mt-2 flex flex-col items-center gap-1.5 font-mono text-[11px] text-dim">
            {mode === "login" ? (
              <>
                <button type="button" className="hover:text-acid" onClick={() => { setMode("forgot"); setMsg(null); }}>Esqueci minha senha</button>
                <span>Acesso criado pelo administrador</span>
              </>
            ) : (
              <button type="button" className="hover:text-acid" onClick={() => { setMode("login"); setMsg(null); }}>Voltar para entrar</button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
