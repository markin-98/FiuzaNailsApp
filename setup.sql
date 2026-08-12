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
alter table public.agendamentos add column if not exists periodo tsrange
  generated always as (
    tsrange((data + hora)::timestamp, (data + hora)::timestamp + (duracao_min || ' minutes')::interval)
  ) stored;
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
drop policy if exists "Profiles leitura autenticados" on public.profiles;
create policy "Profiles leitura autenticados" on public.profiles
  for select to authenticated using (true);

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

-- ── 6. LIMPEZA DE SERVIÇOS ───────────────────────────────────
-- Remove os serviços fora do catálogo que não têm agendamentos
delete from public.servicos
where nome not in (
  'Remoção', 'Alongamento molde F1', 'Manutenção',
  'Manutenção de outro local', 'Francesa definitiva',
  'Decoração completa', 'Blindagem', 'Banho de gel'
)
and id not in (
  select servico_id from public.agendamentos where servico_id is not null
);

-- Desativa os fora do catálogo que têm agendamentos (não pode deletar)
update public.servicos set ativo = false
where nome not in (
  'Remoção', 'Alongamento molde F1', 'Manutenção',
  'Manutenção de outro local', 'Francesa definitiva',
  'Decoração completa', 'Blindagem', 'Banho de gel'
);

-- Remove duplicatas (mantém o mais antigo de cada nome)
delete from public.servicos
where id in (
  select id from (
    select id, row_number() over (partition by nome order by created_at) as rn
    from public.servicos
  ) ranked
  where rn > 1
);

-- Adiciona restrição única por nome (se ainda não existir)
do $$ begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'servicos_nome_unique'
    and table_name = 'servicos'
  ) then
    alter table public.servicos add constraint servicos_nome_unique unique (nome);
  end if;
end $$;

-- ── 7. SEED — Catálogo Fiuza Nails ─────────────────────────
-- Insere os 8 serviços do catálogo; se já existem, atualiza preço/duração/descrição e ativa
insert into public.servicos (nome, preco, duracao, descricao, ativo) values
  ('Remoção',                   60,  30, 'Remoção do gel ou alongamento anterior',              true),
  ('Alongamento molde F1',     120, 120, 'Alongamento em molde F1 — técnica exclusiva',         true),
  ('Manutenção',               100,  90, 'Manutenção do alongamento (a cada 3 semanas)',         true),
  ('Manutenção de outro local', 110,  90, 'Manutenção vinda de outro profissional — avaliada previamente', true),
  ('Francesa definitiva',        20,  20, 'French permanente — cobrada à parte',                true),
  ('Decoração completa',         35,  30, 'Nail art completa — cobrada à parte do serviço',     true),
  ('Blindagem',                  80,  60, 'Blindagem protetora para as unhas naturais',         true),
  ('Banho de gel',              100,  60, 'Reforço e brilho com gel sobre unhas naturais',      true)
on conflict (nome) do update set
  preco     = excluded.preco,
  duracao   = excluded.duracao,
  descricao = excluded.descricao,
  ativo     = true;

-- ── 8. ADMIN ─────────────────────────────────────────────────
-- Define quem é admin (rode após o primeiro login de Fabiana)
update public.profiles set role = 'admin'
where email = 'marcusv2354@gmail.com';

-- ============================================================
