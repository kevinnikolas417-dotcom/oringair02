import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Nova senha — Gestão & Precificação Pro" },
      { name: "description", content: "Defina uma nova senha para acessar o painel." },
      { property: "og:title", content: "Nova senha — Gestão & Precificação Pro" },
      { property: "og:description", content: "Defina uma nova senha para acessar o painel." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    const { data } = supabase.auth.onAuthStateChange((e, session) => {
      if (!active) return;
      if (e === "PASSWORD_RECOVERY" || (e === "SIGNED_IN" && session)) {
        setReady(true);
        setChecking(false);
      }
    });

    (async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");
        const tokenHash = params.get("token_hash");
        const type = params.get("type");

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          if (active) setReady(true);
        } else if (tokenHash && type === "recovery") {
          const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
          if (error) throw error;
          if (active) setReady(true);
        } else if (window.location.hash.includes("type=recovery")) {
          if (active) setReady(true);
        } else {
          const { data: d } = await supabase.auth.getSession();
          if (active && d.session) setReady(true);
        }
      } catch (err) {
        if (active) {
          setMsg(err instanceof Error ? err.message : "Link inválido ou expirado. Solicite um novo link.");
        }
      } finally {
        if (active) setChecking(false);
      }
    })();

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setMsg("As senhas não coincidem.");
      return;
    }
    setBusy(true); setMsg(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) { setMsg(error.message); return; }
    navigate({ to: "/", replace: true });
  };

  return (
    <div className="gridbg grid min-h-screen place-items-center bg-ground px-4 text-ink">
      <form onSubmit={submit} className="grid w-full max-w-sm gap-3 rounded-xl bg-panel2 p-5 ring-1 ring-line">
        <h1 className="text-lg font-semibold">Definir nova senha</h1>
        {checking ? (
          <p className="font-mono text-[11px] text-dim">Validando link de recuperação…</p>
        ) : !ready ? (
          <div className="grid gap-3">
            <p className="font-mono text-[11px] text-dim">
              {msg ?? "Abra esta página pelo link enviado ao seu e-mail ou solicite um novo link de recuperação."}
            </p>
            <Link to="/auth" className="btn-acid text-center">Voltar para entrar</Link>
          </div>
        ) : (
          <>
            <label><span className="label-mono">Nova senha</span>
              <input className="field" type="password" required minLength={6} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
            <label><span className="label-mono">Confirmar nova senha</span>
              <input className="field" type="password" required minLength={6} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></label>
            {msg && <p className="font-mono text-[11px] text-destructive">{msg}</p>}
            <button disabled={busy} className="btn-acid">{busy ? "Salvando…" : "Salvar nova senha"}</button>
          </>
        )}
      </form>
    </div>
  );
}
