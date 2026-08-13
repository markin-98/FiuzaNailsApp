// Helper compartilhado pelas duas Edge Functions de notificação: manda um Web
// Push pra uma ou mais inscrições usando as chaves VAPID (a privada só existe
// aqui, como secret da function — nunca no app).
import webpush from "npm:web-push@3.6.7";

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";

webpush.setVapidDetails(
  "mailto:contato@ffiuzanails.com",
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY,
);

export interface Sub {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  title: string;
  body: string;
  tag?: string;
  url?: string;
}

// Manda pra todas as inscrições de uma vez; se uma inscrição estiver morta
// (410/404 — usuária desinstalou/revogou), apaga ela do banco.
export async function sendToSubs(
  supabase: any,
  subs: Sub[],
  payload: PushPayload,
) {
  const body = JSON.stringify(payload);
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        body,
      );
    } catch (err: any) {
      const status = err?.statusCode;
      if (status === 404 || status === 410) {
        await supabase.from("push_subscriptions").delete().eq("id", s.id);
      } else {
        console.error("push send failed:", s.endpoint, status, err?.body || err);
      }
    }
  }));
}

export function fmtMoney(v: number) {
  return "R$ " + Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
}

export function fmtHora(h: string) {
  return h ? h.slice(0, 5) : "";
}

export function fmtData(d: string) {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}
