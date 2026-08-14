// Disparada pelo trigger trg_notify_agendamento (via pg_net) toda vez que um
// agendamento é criado ou muda de status. Manda push instantâneo pra quem
// precisa saber: admin (novo pedido) ou cliente (Pix confirmado/cancelado).
import { createClient } from "npm:@supabase/supabase-js@2";
import { fmtData, fmtHora, fmtMoney, sendToSubs, urlParaTab } from "../_shared/push.ts";

const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.headers.get("x-webhook-secret") !== WEBHOOK_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }

  const { agendamento_id, evento } = await req.json();
  if (!agendamento_id || !evento) {
    return new Response("bad request", { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: a } = await supabase
    .from("agendamentos")
    .select("*, cliente:profiles(id,nome), servico:servicos(nome)")
    .eq("id", agendamento_id)
    .single();
  if (!a) return new Response("not found", { status: 404 });

  const nomeCliente = a.cliente?.nome?.split(" ")[0] || "Cliente";
  const servNome = a.servico?.nome || "Serviço";
  const quando = `${fmtData(a.data)} às ${fmtHora(a.hora)}`;

  // Cada grupo tem sua própria aba de destino — admin e cliente nunca veem a
  // mesma tela ao clicar na notificação (uma tem "agenda/dashboard", a outra
  // "início/histórico").
  const grupos: { recipients: string[]; payload: any }[] = [];
  const tagBase = `agend-${a.id}`;

  if (evento === "novo_pedido") {
    const { data: admins } = await supabase.from("profiles").select("id").eq("role", "admin");
    grupos.push({
      recipients: (admins || []).map((x: any) => x.id),
      payload: {
        title: "✨ Novo pedido de agendamento",
        body: `${nomeCliente} pediu ${servNome} — ${quando} · ${fmtMoney(a.valor)}`,
        tag: tagBase, tab: "dashboard", url: urlParaTab("dashboard"),
      },
    });
  } else if (evento === "pix_confirmado") {
    grupos.push({
      recipients: a.cliente_id ? [a.cliente_id] : [],
      payload: {
        title: "✅ Agendamento confirmado!",
        body: `Seu horário de ${servNome} em ${quando} está confirmado 💅`,
        tag: tagBase, tab: "home", url: urlParaTab("home"),
      },
    });
  } else if (evento === "cancelado") {
    // avisa as duas pontas — sempre é relevante pra quem não foi quem cancelou
    const { data: admins } = await supabase.from("profiles").select("id").eq("role", "admin");
    if (a.cliente_id) {
      grupos.push({
        recipients: [a.cliente_id],
        payload: {
          title: "⚠️ Agendamento cancelado",
          body: `${servNome} de ${quando} foi cancelado`,
          tag: tagBase, tab: "historico", url: urlParaTab("historico"),
        },
      });
    }
    grupos.push({
      recipients: (admins || []).map((x: any) => x.id),
      payload: {
        title: "⚠️ Agendamento cancelado",
        body: `${servNome} de ${nomeCliente} em ${quando} foi cancelado`,
        tag: tagBase, tab: "dashboard", url: urlParaTab("dashboard"),
      },
    });
  } else {
    return new Response("ignored", { status: 200 });
  }

  let enviados = 0, falhas = 0;
  for (const g of grupos) {
    if (!g.recipients.length) continue;
    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("id,endpoint,p256dh,auth")
      .in("user_id", g.recipients);
    const r = await sendToSubs(supabase, subs || [], g.payload);
    enviados += r.enviados; falhas += r.falhas;
  }
  if (falhas) console.error(`notify-agendamento: ${falhas} envio(s) falharam (evento ${evento}) — confira VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY`);

  return new Response(JSON.stringify({ enviados, falhas }), { status: 200, headers: { "Content-Type": "application/json" } });
});
