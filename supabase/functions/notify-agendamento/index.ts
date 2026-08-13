// Disparada pelo trigger trg_notify_agendamento (via pg_net) toda vez que um
// agendamento é criado ou muda de status. Manda push instantâneo pra quem
// precisa saber: admin (novo pedido) ou cliente (Pix confirmado/cancelado).
import { createClient } from "npm:@supabase/supabase-js@2";
import { fmtData, fmtHora, fmtMoney, sendToSubs } from "../_shared/push.ts";

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

  let recipients: string[] = [];
  let payload = { title: "Fiuza Nails 💅", body: "", tag: `agend-${a.id}`, url: "./index.html" };

  if (evento === "novo_pedido") {
    const { data: admins } = await supabase.from("profiles").select("id").eq("role", "admin");
    recipients = (admins || []).map((x: any) => x.id);
    payload.title = "✨ Novo pedido de agendamento";
    payload.body = `${nomeCliente} pediu ${servNome} — ${quando} · ${fmtMoney(a.valor)}`;
  } else if (evento === "pix_confirmado") {
    recipients = a.cliente_id ? [a.cliente_id] : [];
    payload.title = "✅ Agendamento confirmado!";
    payload.body = `Seu horário de ${servNome} em ${quando} está confirmado 💅`;
  } else if (evento === "cancelado") {
    // avisa as duas pontas — sempre é relevante pra quem não foi quem cancelou
    const { data: admins } = await supabase.from("profiles").select("id").eq("role", "admin");
    recipients = [...(a.cliente_id ? [a.cliente_id] : []), ...((admins || []).map((x: any) => x.id))];
    payload.title = "⚠️ Agendamento cancelado";
    payload.body = `${servNome} de ${nomeCliente} em ${quando} foi cancelado`;
  } else {
    return new Response("ignored", { status: 200 });
  }

  if (!recipients.length) return new Response("no recipients", { status: 200 });

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("id,endpoint,p256dh,auth")
    .in("user_id", recipients);

  await sendToSubs(supabase, subs || [], payload);

  return new Response("ok", { status: 200 });
});
