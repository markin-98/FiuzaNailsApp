// Feed .ics (webcal) da agenda — pra Fabiana assinar no Calendário do iPhone e
// ver os agendamentos confirmados sem precisar copiar nada manualmente. É via
// query param (?token=...), não header, porque o app Calendário do iOS não
// manda cabeçalho customizado nenhum quando busca o feed — por isso o
// verify_jwt do gateway está desligado (config.toml) e a autenticação é
// inteiramente o token conferido aqui dentro, comparado com o que fica
// guardado em salon_config.info.agenda_ics_token.
//
// Só entram agendamentos com status='agendado' (confirmados) — pendente de
// Pix não entra pra não colocar hora "fantasma" no calendário dela que pode
// nunca se confirmar.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Brasília não tem horário de verão desde 2019 — offset fixo -03:00, sempre.
function brDateTime(data: string, hora: string) {
  return new Date(`${data}T${(hora || "00:00:00").slice(0, 5)}:00-03:00`);
}
function toICS(dt: Date) {
  return dt.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}
function esc(s: string) {
  return String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}
function fmtMoney(v: number) {
  return "R$ " + Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") || "";

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: config } = await supabase.from("salon_config").select("info").eq("id", 1).single();
  const validToken = config?.info?.agenda_ics_token;
  if (!validToken || token !== validToken) {
    return new Response("unauthorized", { status: 401 });
  }
  const endereco = config?.info?.endereco || "";

  // Desde ontem (pega o resto do dia de ontem em fusos mais atrasados) até
  // sempre — agenda de salão pequeno, não precisa limitar o futuro.
  const from = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10);

  const { data: ags, error } = await supabase
    .from("agendamentos")
    .select("id,data,hora,duracao_min,valor,obs,nome_avulso,tel_avulso,servicos_ids,cliente:profiles(nome,tel),servico:servicos(nome)")
    .eq("status", "agendado")
    .gte("data", from)
    .order("data").order("hora");

  if (error) return new Response(error.message, { status: 500 });

  const now = toICS(new Date());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Fiuza Nails//Agenda//PT",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Fiuza Nails — Agenda",
    "X-WR-TIMEZONE:America/Sao_Paulo",
    "REFRESH-INTERVAL;VALUE=DURATION:PT15M",
    "X-PUBLISHED-TTL:PT15M",
  ];

  for (const a of ags || []) {
    const nome = (a.cliente as any)?.nome || a.nome_avulso || "Cliente";
    const tel = (a.cliente as any)?.tel || a.tel_avulso || "";
    const servNome = (a.servico as any)?.nome || "Serviço";
    const extras = (a.servicos_ids?.length || 0) > 1 ? ` (+${a.servicos_ids!.length - 1})` : "";
    const start = brDateTime(a.data, a.hora);
    const end = new Date(start.getTime() + (a.duracao_min || 60) * 60000);
    const descLinhas = [
      tel ? `Tel: ${tel}` : null,
      `Valor: ${fmtMoney(a.valor)}`,
      a.obs ? `Obs: ${a.obs}` : null,
    ].filter(Boolean).join("\n");

    lines.push(
      "BEGIN:VEVENT",
      `UID:${a.id}@ffiuzanails.app`,
      `DTSTAMP:${now}`,
      `DTSTART:${toICS(start)}`,
      `DTEND:${toICS(end)}`,
      `SUMMARY:${esc(`${servNome}${extras} — ${nome}`)}`,
    );
    if (descLinhas) lines.push(`DESCRIPTION:${esc(descLinhas)}`);
    if (endereco) lines.push(`LOCATION:${esc(endereco)}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  return new Response(lines.join("\r\n") + "\r\n", {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
});
