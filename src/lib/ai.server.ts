// Server-only AI client calling the OpenAI Responses API directly (configurable via env vars on Vercel).
// Set OPENAI_API_KEY in Vercel environment variables; optionally override OPENAI_BASE_URL or OPENAI_MODEL.

export async function callStructuredAi<T>(params: {
  instructions: string;
  input: string;
  schemaName: string;
  schema: Record<string, unknown>;
  errorLabel?: string;
}): Promise<T> {
  const apiKey = process.env["OPENAI_API_KEY"];
  if (!apiKey) {
    throw new Error("IA não configurada. Defina OPENAI_API_KEY nas variáveis de ambiente da Vercel.");
  }

  const baseUrl = (process.env["OPENAI_BASE_URL"] ?? "https://api.openai.com/v1").replace(/\/+$/, "");
  const model = process.env["OPENAI_MODEL"] ?? "gpt-4o-mini";

  const res = await fetch(`${baseUrl}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      store: false,
      instructions: params.instructions,
      input: params.input,
      text: {
        format: {
          type: "json_schema",
          name: params.schemaName,
          strict: true,
          schema: params.schema,
        },
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`AI error [${res.status}]: ${body}`);
    if (res.status === 429) throw new Error("Muitas solicitações à IA. Aguarde um pouco e tente de novo.");
    if (res.status === 402) throw new Error("Créditos de IA esgotados. Verifique o saldo na sua conta OpenAI.");
    throw new Error(`Erro na IA [${res.status}]`);
  }

  const json = (await res.json()) as {
    output_text?: string;
    output?: { content?: { type?: string; text?: string }[] }[];
  };

  const text =
    json.output_text ??
    json.output
      ?.flatMap((o) => o.content ?? [])
      .filter((c) => c.type === "output_text" && typeof c.text === "string")
      .map((c) => c.text)
      .join("") ??
    "";

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(params.errorLabel ?? "A IA não retornou uma resposta válida");
  }
}
