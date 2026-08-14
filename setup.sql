-- ============================================================
-- FFIUZA NAILS — Setup completo do banco de dados
-- Cole este SQL no Supabase Dashboard → SQL Editor → Run
-- Pode ser rodado múltiplas vezes com segurança (idempotente)
-- ============================================================

-- ── 1. PROFILES ─────────────────────────────────────────────
create table if not exists public.profiles (
  id          uuid references auth.users on delete cascade primary key,
  email       text unique,
  nome        text,
  avatar_url  text,
  role        text not null default 'cliente',
  tel         text,
  obs         text,
  created_at  timestamptz default now()
);

-- Trigger: cria profile automaticamente no primeiro login
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, nome, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── 2. SERVIÇOS ─────────────────────────────────────────────
create table if not exists public.servicos (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  preco       numeric not null default 0,
  duracao     int default 60,
  descricao   text,
  ativo       boolean default true,
  created_at  timestamptz default now()
);

-- ── 3. AGENDAMENTOS ─────────────────────────────────────────
create table if not exists public.agendamentos (
  id          uuid primary key default gen_random_uuid(),
  cliente_id  uuid references public.profiles(id) on delete cascade,
  servico_id  uuid references public.servicos(id),
  data        date not null,
  hora        time not null,
  valor       numeric default 0,
  status      text default 'agendado',
  obs         text,
  sinal_pago  boolean default false,
  created_at  timestamptz default now()
);
alter table public.agendamentos add column if not exists sinal_pago boolean default false;
alter table public.agendamentos add column if not exists servicos_ids uuid[] default '{}';
alter table public.servicos add column if not exists icone text;

-- ── ANTI DOUBLE-BOOKING: impede duas clientes marcarem o mesmo horário ──
-- Guarda a duração total (min) do agendamento e usa uma exclusion constraint
-- (nível de banco, à prova de condição de corrida) para bloquear qualquer
-- sobreposição de horário no mesmo dia, mesmo se duas clientes confirmarem
-- ao mesmo tempo. Cancelados não contam.
create extension if not exists btree_gist;
alter table public.agendamentos add column if not exists duracao_min int not null default 60;
alter table public.agendamentos add column if not exists periodo tsrange;

-- periodo não pode ser "generated always" porque o Postgres recusa a expressão
-- (erro 42P17: generation expression is not immutable); um trigger resolve igual.
create or replace function public.set_agendamento_periodo()
returns trigger as $$
begin
  new.periodo := tsrange(
    (new.data + new.hora)::timestamp,
    (new.data + new.hora)::timestamp + (new.duracao_min || ' minutes')::interval
  );
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_set_agendamento_periodo on public.agendamentos;
create trigger trg_set_agendamento_periodo
  before insert or update on public.agendamentos
  for each row execute procedure public.set_agendamento_periodo();

-- BACKFILL: recalcula duracao_min a partir da duração real dos serviços do agendamento.
-- Agendamentos criados antes da coluna duracao_min existir ficaram todos com o valor
-- padrão da coluna (60min), mesmo quando o serviço real dura mais — isso fazia o app
-- liberar horários que na verdade estavam ocupados (ex: serviço de 120min marcado às
-- 9h deixava as 10h aparecerem livres). Idempotente: pode rodar sempre, sem risco.
--
-- O UPDATE abaixo passa pelo trigger trg_restrict_agendamento_update (definido mais
-- adiante neste arquivo), que bloqueia updates de quem não é admin — e rodando pelo
-- SQL Editor não existe sessão logada, então is_admin() dá falso e o trigger barra
-- o backfill com "Alteração não permitida para cliente". Por isso ele é desligado
-- durante o backfill e religado logo depois (o "if exists" evita erro caso essa seja
-- a primeira vez que o arquivo roda e o trigger ainda não tenha sido criado).
do $$ begin
  if exists (select 1 from pg_trigger where tgname='trg_restrict_agendamento_update' and tgrelid='public.agendamentos'::regclass) then
    execute 'alter table public.agendamentos disable trigger trg_restrict_agendamento_update';
  end if;
end $$;

update public.agendamentos a
set duracao_min = coalesce((
  select nullif(sum(coalesce(nullif(s.duracao,0),0)),0)
  from unnest(
    case when a.servicos_ids is not null and array_length(a.servicos_ids,1) > 0
      then a.servicos_ids
      else array[a.servico_id]
    end
  ) as sid
  join public.servicos s on s.id = sid
), 60);

update public.agendamentos
  set periodo = tsrange((data + hora)::timestamp, (data + hora)::timestamp + (duracao_min || ' minutes')::interval)
  where periodo is null or periodo is distinct from tsrange((data + hora)::timestamp, (data + hora)::timestamp + (duracao_min || ' minutes')::interval);

do $$ begin
  if exists (select 1 from pg_trigger where tgname='trg_restrict_agendamento_update' and tgrelid='public.agendamentos'::regclass) then
    execute 'alter table public.agendamentos enable trigger trg_restrict_agendamento_update';
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'agendamentos_no_overlap'
  ) then
    alter table public.agendamentos
      add constraint agendamentos_no_overlap
      exclude using gist (data with =, periodo with &&)
      where (status <> 'cancelado');
  end if;
end $$;

-- ── REALTIME: atualizações ao vivo dos agendamentos ─────────
-- Permite que o app receba mudanças em tempo real (novo pedido, Pix confirmado,
-- cancelamento). REPLICA IDENTITY FULL faz o registro antigo vir nos eventos de
-- UPDATE/DELETE, necessário para detectar a transição de status e para os filtros.
alter table public.agendamentos replica identity full;
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'agendamentos'
  ) then
    alter publication supabase_realtime add table public.agendamentos;
  end if;
end $$;

-- ── HORÁRIOS OCUPADOS (visível pra qualquer cliente, sem vazar dados) ───────
-- A policy "Agendamentos cliente ve os seus" só deixa a cliente ler os
-- PRÓPRIOS agendamentos — correto pra privacidade, mas o app usa essa mesma
-- consulta pra saber quais horários já estão ocupados no dia, então uma
-- cliente nunca via os agendamentos de outra e todo horário aparecia livre
-- pra ela (só travava ao confirmar, pela exclusion constraint). Esta função
-- devolve só hora+duração de quem está ocupado naquele dia — nada de nome,
-- telefone ou cliente_id — então pode ser liberada pra qualquer autenticado.
create or replace function public.horarios_ocupados(p_data date)
returns table(hora time, duracao_min int)
language sql security definer stable as $$
  select hora, duracao_min from public.agendamentos
  where data = p_data and status <> 'cancelado';
$$;
grant execute on function public.horarios_ocupados(date) to authenticated;

-- ── PUSH NOTIFICATIONS ───────────────────────────────────────
-- Cada aparelho que aceita notificação vira uma linha aqui (endpoint único do
-- navegador/OS + as chaves de criptografia do Web Push). Usada pelas Edge
-- Functions notify-agendamento e send-reminders pra saber pra onde mandar.
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles(id) on delete cascade not null,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists "Push subs - propria" on public.push_subscriptions;
create policy "Push subs - propria" on public.push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
-- As Edge Functions leem todas as inscrições usando a service_role key, que
-- ignora RLS — não precisam de policy de admin aqui.

-- Marca se já foi mandado o lembrete de 24h/1h, pra send-reminders não repetir
alter table public.agendamentos add column if not exists lembrete_24h_enviado boolean default false;
alter table public.agendamentos add column if not exists lembrete_1h_enviado boolean default false;

-- ── DISPARO INSTANTÂNEO: novo pedido / Pix confirmado / cancelamento ────────
-- pg_net manda um POST HTTP pra Edge Function notify-agendamento sempre que um
-- agendamento é criado ou muda de status relevante. O segredo compartilhado
-- (guardado no Vault, nunca neste arquivo) autentica a chamada — sem ele
-- qualquer pessoa poderia chamar a function e mandar notificação falsa.
--
-- ⚠️ Antes de rodar isto, crie o segredo UMA VEZ no SQL Editor (não salve esse
-- comando em nenhum arquivo do repositório):
--   select vault.create_secret('SEU_SEGREDO_AQUI', 'webhook_secret');
-- e configure a mesma string como variável de ambiente WEBHOOK_SECRET nas
-- duas Edge Functions (supabase secrets set WEBHOOK_SECRET=SEU_SEGREDO_AQUI).
create extension if not exists pg_net;

create or replace function public.notify_agendamento_change()
returns trigger as $$
declare
  evento text;
  secret text;
begin
  if tg_op='INSERT' and new.status='pendente' then
    evento:='novo_pedido';
  elsif tg_op='UPDATE' and old.status is distinct from new.status then
    if new.status='agendado' and old.status='pendente' then evento:='pix_confirmado';
    elsif new.status='cancelado' then evento:='cancelado';
    end if;
  end if;

  if evento is not null then
    -- BLINDAGEM: notificação é um "extra" — nunca pode derrubar o agendamento
    -- em si. Se o pg_net/Vault falhar por qualquer motivo (extensão não
    -- habilitada, segredo não criado, etc.), só registra um aviso no log e
    -- segue a vida; sem isso, um erro aqui desfazia o INSERT/UPDATE inteiro
    -- (a cliente achava que tinha marcado e não tinha marcado nada).
    begin
      select decrypted_secret into secret from vault.decrypted_secrets where name='webhook_secret';
      if secret is not null then
        perform net.http_post(
          url:='https://yjslyloaydufvneaauqm.supabase.co/functions/v1/notify-agendamento',
          headers:=jsonb_build_object('Content-Type','application/json','x-webhook-secret',secret),
          body:=jsonb_build_object('agendamento_id',new.id,'evento',evento)
        );
      end if;
    exception when others then
      raise warning 'notify_agendamento_change: falha ao notificar (%): %', evento, sqlerrm;
    end;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public, vault;

drop trigger if exists trg_notify_agendamento on public.agendamentos;
create trigger trg_notify_agendamento
  after insert or update on public.agendamentos
  for each row execute procedure public.notify_agendamento_change();

-- ── LEMBRETES 24h/1h: roda sozinho a cada 10 minutos ────────────────────────
-- pg_cron chama a Edge Function send-reminders periodicamente; ela mesma
-- decide quem está a ~24h ou ~1h do horário marcado e evita duplicar usando
-- as colunas lembrete_24h_enviado/lembrete_1h_enviado.
create extension if not exists pg_cron;

do $$ begin
  if exists (select 1 from cron.job where jobname = 'fiuza-lembretes') then
    perform cron.unschedule('fiuza-lembretes');
  end if;
end $$;

select cron.schedule('fiuza-lembretes', '*/10 * * * *', $cron$
  select net.http_post(
    url:='https://yjslyloaydufvneaauqm.supabase.co/functions/v1/send-reminders',
    headers:=jsonb_build_object(
      'Content-Type','application/json',
      'x-webhook-secret',(select decrypted_secret from vault.decrypted_secrets where name='webhook_secret')
    )
  );
$cron$);

-- Fidelidade: contador de prêmios resgatados por cliente
alter table public.profiles add column if not exists premios_resgatados integer default 0;

-- RLS: admin pode atualizar premios_resgatados nas clientes
drop policy if exists "Profiles admin atualiza" on public.profiles;
create policy "Profiles admin atualiza" on public.profiles
  for update using (public.is_admin());

-- ── 4. CONFIGURAÇÕES DO SALÃO ────────────────────────────────
create table if not exists public.salon_config (
  id          integer primary key default 1 check (id = 1),
  horarios    text[] default array['09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00'],
  info        jsonb default '{}'::jsonb,
  updated_at  timestamptz default now()
);
insert into public.salon_config (id) values (1) on conflict (id) do nothing;
alter table public.salon_config add column if not exists info jsonb default '{}'::jsonb;

-- ── 5. RLS (Row Level Security) ──────────────────────────────
alter table public.profiles     enable row level security;
alter table public.servicos     enable row level security;
alter table public.agendamentos enable row level security;
alter table public.salon_config enable row level security;

-- Função helper: evita recursão no RLS
create or replace function public.is_admin()
returns boolean language sql security definer stable as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin')
$$;

-- Profiles
-- SEGURANÇA: antes qualquer cliente logada podia ler profiles de TODAS as outras
-- clientes (nome, email, telefone) direto pelo console do navegador, pois a policy
-- usava "using (true)". Agora só a própria cliente e a admin podem ler.
drop policy if exists "Profiles leitura autenticados" on public.profiles;
drop policy if exists "Profiles leitura propria ou admin" on public.profiles;
create policy "Profiles leitura propria ou admin" on public.profiles
  for select to authenticated using (auth.uid() = id or public.is_admin());

drop policy if exists "Profiles atualiza proprio" on public.profiles;
create policy "Profiles atualiza proprio" on public.profiles
  for update using (auth.uid() = id);

-- Serviços
drop policy if exists "Servicos leitura publica" on public.servicos;
create policy "Servicos leitura publica" on public.servicos
  for select using (true);

drop policy if exists "Servicos escrita admin" on public.servicos;
create policy "Servicos escrita admin" on public.servicos
  for all using (public.is_admin());

-- Agendamentos
drop policy if exists "Agendamentos cliente ve os seus" on public.agendamentos;
create policy "Agendamentos cliente ve os seus" on public.agendamentos
  for select using (cliente_id = auth.uid() or public.is_admin());

drop policy if exists "Agendamentos cliente cria" on public.agendamentos;
create policy "Agendamentos cliente cria" on public.agendamentos
  for insert with check (cliente_id = auth.uid() OR public.is_admin());

drop policy if exists "Agendamentos cliente cancela" on public.agendamentos;
create policy "Agendamentos cliente cancela" on public.agendamentos
  for update using (cliente_id = auth.uid() or public.is_admin());

drop policy if exists "Agendamentos admin deleta" on public.agendamentos;
create policy "Agendamentos admin deleta" on public.agendamentos
  for delete using (public.is_admin());

-- ── SEGURANÇA: impede escalonamento de privilégio e fraude de status ──
-- As policies acima usam só "using", sem "with check", então uma cliente
-- autenticada podia chamar update() direto pelo console do navegador e:
--   1) virar admin (profiles.role)
--   2) marcar o próprio Pix como pago / agendamento como concluído
--      (sinal_pago, status) sem a Fabiana verificar nada.
-- Os triggers abaixo bloqueiam essas alterações quando quem faz a
-- alteração não é admin.

create or replace function public.prevent_role_self_change()
returns trigger as $$
begin
  if not public.is_admin() and new.role is distinct from old.role then
    new.role := old.role;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_prevent_role_change on public.profiles;
create trigger trg_prevent_role_change
  before update on public.profiles
  for each row execute procedure public.prevent_role_self_change();

drop policy if exists "Agendamentos cliente cria" on public.agendamentos;
create policy "Agendamentos cliente cria" on public.agendamentos
  for insert with check (
    public.is_admin()
    or (cliente_id = auth.uid() and status = 'pendente' and sinal_pago = false)
  );

create or replace function public.restrict_agendamento_update()
returns trigger as $$
begin
  if public.is_admin() then
    return new;
  end if;
  -- A Edge Function de lembretes (send-reminders) marca lembrete_24h_enviado/
  -- lembrete_1h_enviado usando a service_role key, que não é "admin" pra
  -- is_admin() (não tem sessão/auth.uid()). Como isso não é sensível, libera
  -- sempre que só esses dois flags mudam e mais nada.
  if new.status is not distinct from old.status
     and new.cliente_id is not distinct from old.cliente_id
     and new.data is not distinct from old.data
     and new.hora is not distinct from old.hora
     and new.valor is not distinct from old.valor
     and new.sinal_pago is not distinct from old.sinal_pago
     and new.servico_id is not distinct from old.servico_id
  then
    return new;
  end if;
  -- A Edge Function send-reminders também cancela Pix pendente vencido (>24h) e
  -- marca no-show ("faltante") sozinha via cron, com a service_role key — sem
  -- sessão, então auth.uid() vem null aqui. Libera essas duas transições
  -- específicas de sistema quando mais nada além do status muda.
  if auth.uid() is null
     and new.cliente_id is not distinct from old.cliente_id
     and new.data is not distinct from old.data
     and new.hora is not distinct from old.hora
     and new.valor is not distinct from old.valor
     and new.sinal_pago is not distinct from old.sinal_pago
     and new.servico_id is not distinct from old.servico_id
     and (
       (old.status='pendente' and new.status='cancelado')
       or (old.status='agendado' and new.status='faltante')
     )
  then
    return new;
  end if;
  -- cliente só pode cancelar o próprio agendamento; mais nada muda
  if old.status = 'cancelado'
     or new.status <> 'cancelado'
     or new.cliente_id is distinct from old.cliente_id
     or new.data is distinct from old.data
     or new.hora is distinct from old.hora
     or new.valor is distinct from old.valor
     or new.sinal_pago is distinct from old.sinal_pago
     or new.servico_id is distinct from old.servico_id
  then
    raise exception 'Alteração não permitida para cliente';
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_restrict_agendamento_update on public.agendamentos;
create trigger trg_restrict_agendamento_update
  before update on public.agendamentos
  for each row execute procedure public.restrict_agendamento_update();

-- Salon config
drop policy if exists "Config leitura" on public.salon_config;
create policy "Config leitura" on public.salon_config for select using (true);

drop policy if exists "Config escrita admin" on public.salon_config;
create policy "Config escrita admin" on public.salon_config for all using (public.is_admin());

-- NOTA: a limpeza/seed do catálogo de serviços foi removida deste arquivo.
-- Fabiana cadastra, edita e exclui os serviços dela pelo próprio painel admin —
-- rodar um seed/limpeza fixo aqui de novo apagaria ou duplicaria o que ela mudou.

-- ── 8. ADMIN ─────────────────────────────────────────────────
-- Define quem é admin (rode após o primeiro login de Fabiana)
update public.profiles set role = 'admin'
where email = 'marcusv2354@gmail.com';

-- ============================================================
