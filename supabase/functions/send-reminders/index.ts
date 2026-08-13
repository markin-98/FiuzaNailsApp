// Disparada pelo pg_cron a cada 10 minutos (job "fiuza-lembretes"). Varre os
// agendamentos confirmados e manda lembrete de 24h e de 1h antes do horário,
// sem repetir (marca lembrete_24h_enviado/lembrete_1h_enviado depois de mandar).
import { createClient } from "npm:@supabase/supabase-js@2";
import { fmtData, fmtHora, sendToSubs } from "../_shared/push.ts";

const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Brasília não tem horário de verão desde 2019 — offset fixo -03:00, sempre.
function brDateTime(data: string, hora: string) {
  return new Date(`${data}T${(hora || "00:00:00").slice(0, 5)}:00-03:00`);
}

Deno.serve(async (req) => {
  if (req.headers.get("x-webhook-secret") !== WEBHOOK_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const now = Date.now();
  const fromDs = new Date(now - 24 * 3600 * 1000).toISOString().slice(0, 10);
  const toDs = new Date(now + 2 * 24 * 3600 * 1000).toISOString().slice(0, 10);

  const { data: candidatos, error } = await supabase
    .from("agendamentos")
    .select("id,data,hora,cliente_id,lembrete_24h_enviado,lembrete_1h_enviado,cliente:profiles(nome),servico:servicos(nome)")
    .eq("status", "agendado")
    .gte("data", fromDs).lte("data", toDs)
    .or("lembrete_24h_enviado.eq.false,lembrete_1h_enviado.eq.false");

  if (error) return new Response(error.message, { status: 500 });

  const enviar24: any[] = [];
  const enviar1: any[] = [];

  // Janela de 10min (igual ao intervalo do cron) em volta da marca de 24h/1h —
  // cada agendamento cai numa única janela de cada tipo, então não duplica.
  for (const a of candidatos || []) {
    const diffMin = (brDateTime(a.data, a.hora).getTime() - now) / 60000;
    if (!a.lembrete_24h_enviado && diffMin <= 24 * 60 && diffMin > 24 * 60 - 10) enviar24.push(a);
    if (!a.lembrete_1h_enviado && diffMin <= 60 && diffMin > 50) enviar1.push(a);
  }

  async function enviarGrupo(lista: any[], flagCol: string, label: "24h" | "1h") {
    for (const a of lista) {
      if (!a.cliente_id) continue;
      const nome = (a.cliente as any)?.nome?.split(" ")[0] || "Cliente";
      const servNome = (a.servico as any)?.nome || "Serviço";
      const hora = fmtHora(a.hora);

      const { data: subs } = await supabase
        .from("push_subscriptions")
        .select("id,endpoint,p256dh,auth")
        .eq("user_id", a.cliente_id);

      await sendToSubs(supabase, subs || [], {
        title: label === "24h" ? "📅 Lembrete: horário amanhã" : "⏰ Seu horário está chegando",
        body: label === "24h"
          ? `Olá ${nome}! Você tem ${servNome} marcado amanhã, ${fmtData(a.data)} às ${hora} 💅`
          : `${nome}, seu atendimento de ${servNome} é daqui a 1h (${hora}) 💅`,
        tag: `lembrete-${label}-${a.id}`,
        url: "./index.html",
      });

      await supabase.from("agendamentos").update({ [flagCol]: true }).eq("id", a.id);
    }
  }

  await enviarGrupo(enviar24, "lembrete_24h_enviado", "24h");
  await enviarGrupo(enviar1, "lembrete_1h_enviado", "1h");

  return new Response(
    JSON.stringify({ enviados_24h: enviar24.length, enviados_1h: enviar1.length }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
