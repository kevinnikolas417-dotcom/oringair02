import { createFileRoute, useNavigate } from "@tanstack/react-router";
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
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (window.location.hash.includes("type=recovery")) setReady(true);
    const { data } = supabase.auth.onAuthStateChange((e) => { if (e === "PASSWORD_RECOVERY") setReady(true); });
    supabase.auth.getSession().then(({ data: d }) => { if (d.session) setReady(true); });
    return () => data.subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
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
        {!ready ? (
          <p className="font-mono text-[11px] text-dim">Abra esta página pelo link enviado ao seu e-mail.</p>
        ) : (
          <>
            <label><span className="label-mono">Nova senha</span>
              <input className="field" type="password" required minLength={6} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
            {msg && <p className="font-mono text-[11px] text-destructive">{msg}</p>}
            <button disabled={busy} className="btn-acid">{busy ? "Salvando…" : "Salvar nova senha"}</button>
          </>
        )}
      </form>
    </div>
  );
}
