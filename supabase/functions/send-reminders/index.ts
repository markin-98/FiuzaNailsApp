// Disparada pelo pg_cron a cada 10 minutos (job "fiuza-lembretes"). Faz 3 coisas,
// tudo sozinho no servidor — sem depender de ninguém com o app aberto:
//   1) cancela Pix pendente há mais de 24h sem confirmação (libera o horário)
//   2) marca "faltante" quem passou do horário sem ser concluído
//   3) manda lembrete de 24h e de 1h antes do horário (sem repetir)
// Os itens 1 e 2 antes só rodavam de dentro do painel admin (autoCancelExpiredPending/
// checkNoShows em script.js) — se a Fabiana ficasse um dia sem abrir o app, o Pix
// pendente vencido continuava travando o horário pra outras clientes (a trava do
// banco só ignora status='cancelado'). Agora roda no servidor, sempre.
import { createClient } from "npm:@supabase/supabase-js@2";
import { fmtData, fmtHora, sendToSubs, urlParaTab } from "../_shared/push.ts";

const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Brasília não tem horário de verão desde 2019 — offset fixo -03:00, sempre.
function brDateTime(data: string, hora: string) {
  return new Date(`${data}T${(hora || "00:00:00").slice(0, 5)}:00-03:00`);
}

async function limparPendentesExpirados(supabase: any) {
  const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: expirados } = await supabase
    .from("agendamentos").select("id")
    .eq("status", "pendente").lt("created_at", cutoff);
  if (!expirados?.length) return 0;
  await supabase.from("agendamentos").update({ status: "cancelado" }).in("id", expirados.map((a: any) => a.id));
  return expirados.length;
}

async function marcarFaltas(supabase: any, now: number, fromDs: string, toDs: string) {
  const { data: candidatos } = await supabase
    .from("agendamentos").select("id,data,hora,duracao_min")
    .eq("status", "agendado")
    .gte("data", fromDs).lte("data", toDs);
  const vencidos = (candidatos || []).filter((a: any) => {
    const fim = brDateTime(a.data, a.hora).getTime() + (a.duracao_min || 60) * 60000;
    return fim < now;
  });
  if (!vencidos.length) return 0;
  await supabase.from("agendamentos").update({ status: "faltante" }).in("id", vencidos.map((a: any) => a.id));
  return vencidos.length;
}

Deno.serve(async (req) => {
  if (req.headers.get("x-webhook-secret") !== WEBHOOK_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const now = Date.now();
  const fromDs = new Date(now - 24 * 3600 * 1000).toISOString().slice(0, 10);
  const toDs = new Date(now + 2 * 24 * 3600 * 1000).toISOString().slice(0, 10);

  const cancelados = await limparPendentesExpirados(supabase);
  const faltas = await marcarFaltas(supabase, now, fromDs, toDs);

  const { data: candidatos, error } = await supabase
    .from("agendamentos")
    .select("id,data,hora,cliente_id,lembrete_24h_enviado,lembrete_1h_enviado,cliente:profiles(nome),servico:servicos(nome)")
    .eq("status", "agendado")
    .gte("data", fromDs).lte("data", toDs)
    .or("lembrete_24h_enviado.eq.false,lembrete_1h_enviado.eq.false");

  if (error) return new Response(error.message, { status: 500 });

  const enviar24: any[] = [];
  const enviar1: any[] = [];

  // Sem janela fechada nos dois lados: se o cron atrasar ou perder um ciclo, o
  // agendamento continua elegível no próximo tick em vez de nunca mais mandar o
  // lembrete (a flag lembrete_Xh_enviado é o que evita duplicar, não a janela).
  // 24h exige mais de 60min de sobra pra não se sobrepor com o lembrete de 1h.
  for (const a of candidatos || []) {
    const diffMin = (brDateTime(a.data, a.hora).getTime() - now) / 60000;
    if (!a.lembrete_24h_enviado && diffMin <= 24 * 60 && diffMin > 60) enviar24.push(a);
    if (!a.lembrete_1h_enviado && diffMin <= 60 && diffMin > -10) enviar1.push(a);
  }

  let enviados = 0, falhasPush = 0;
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

      const r = await sendToSubs(supabase, subs || [], {
        title: label === "24h" ? "📅 Lembrete: horário amanhã" : "⏰ Seu horário está chegando",
        body: label === "24h"
          ? `Olá ${nome}! Você tem ${servNome} marcado amanhã, ${fmtData(a.data)} às ${hora} 💅`
          : `${nome}, seu atendimento de ${servNome} é daqui a 1h (${hora}) 💅`,
        tag: `lembrete-${label}-${a.id}`,
        url: urlParaTab("home"),
        tab: "home",
      });
      enviados += r.enviados; falhasPush += r.falhas;

      await supabase.from("agendamentos").update({ [flagCol]: true }).eq("id", a.id);
    }
  }

  await enviarGrupo(enviar24, "lembrete_24h_enviado", "24h");
  await enviarGrupo(enviar1, "lembrete_1h_enviado", "1h");
  if (falhasPush) console.error(`send-reminders: ${falhasPush} envio(s) de push falharam — confira VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY`);

  return new Response(
    JSON.stringify({
      pix_cancelados: cancelados,
      marcados_faltante: faltas,
      enviados_24h: enviar24.length,
      enviados_1h: enviar1.length,
      push_enviados: enviados,
      push_falhas: falhasPush,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
