-- FamilyExpenses: schema inicial
-- Vive en el schema `family` (el proyecto Supabase se comparte con otras apps).
-- Todas las tablas de negocio llevan family_id y RLS que aísla cada familia.

create schema if not exists family;
grant usage on schema family to anon, authenticated, service_role;

set search_path = family, public;

-- ============================================================
-- Tablas
-- ============================================================

create table families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique default upper(substr(md5(random()::text), 1, 8)),
  created_at timestamptz not null default now()
);

create table profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  family_id uuid not null references families (id) on delete cascade,
  display_name text not null,
  username text not null unique,
  created_at timestamptz not null default now()
);

create table categories (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families (id) on delete cascade,
  name text not null,
  icon text,
  kind text not null check (kind in ('expense', 'income')),
  created_at timestamptz not null default now(),
  unique (family_id, name, kind)
);

create table pets (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families (id) on delete cascade,
  name text not null,
  default_split_pct numeric(5, 2) not null default 0,
  created_at timestamptz not null default now()
);

-- Gastos fijos (plantillas). Versionado: para cambiar un fijo a futuro se
-- cierra la fila vigente (ends_on) y se crea otra con starts_on futuro.
create table recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families (id) on delete cascade,
  category_id uuid references categories (id) on delete set null,
  name text not null,
  amount numeric(12, 2) not null check (amount >= 0),
  period text not null check (period in ('monthly', 'annual')),
  starts_on date not null,
  ends_on date,
  created_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);

create table recurring_incomes (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families (id) on delete cascade,
  profile_id uuid references profiles (user_id) on delete set null,
  name text not null,
  type text not null check (type in ('salary', 'rent', 'other')),
  amount numeric(12, 2) not null check (amount >= 0),
  starts_on date not null,
  ends_on date,
  created_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);

create table import_batches (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families (id) on delete cascade,
  source text not null default 'caixabank_pdf',
  file_name text,
  imported_count int not null default 0,
  created_at timestamptz not null default now()
);

create table transactions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families (id) on delete cascade,
  date date not null,
  amount numeric(12, 2) not null check (amount > 0),
  type text not null check (type in ('expense', 'income')),
  category_id uuid references categories (id) on delete set null,
  description text not null default '',
  recurring_expense_id uuid references recurring_expenses (id) on delete set null,
  recurring_income_id uuid references recurring_incomes (id) on delete set null,
  profile_id uuid references profiles (user_id) on delete set null,
  is_extraordinary boolean not null default false,
  import_batch_id uuid references import_batches (id) on delete set null,
  dedup_hash text,
  created_at timestamptz not null default now()
);

create unique index transactions_dedup_idx
  on transactions (family_id, dedup_hash)
  where dedup_hash is not null;
create index transactions_family_date_idx on transactions (family_id, date);

create table transaction_pet_splits (
  transaction_id uuid not null references transactions (id) on delete cascade,
  pet_id uuid not null references pets (id) on delete cascade,
  amount numeric(12, 2) not null,
  primary key (transaction_id, pet_id)
);

create table savings_accounts (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families (id) on delete cascade,
  name text not null default 'Hucha',
  created_at timestamptz not null default now()
);

create table savings_movements (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references savings_accounts (id) on delete cascade,
  family_id uuid not null references families (id) on delete cascade,
  date date not null default current_date,
  amount numeric(12, 2) not null,
  kind text not null check (kind in ('monthly', 'extra', 'withdrawal', 'interest')),
  note text,
  created_at timestamptz not null default now()
);

create table savings_plans (
  family_id uuid primary key references families (id) on delete cascade,
  monthly_target numeric(12, 2) not null default 0 check (monthly_target >= 0)
);

create table month_closures (
  family_id uuid not null references families (id) on delete cascade,
  month date not null, -- siempre día 1
  closed_at timestamptz not null default now(),
  carryover numeric(12, 2) not null default 0,
  snapshot jsonb not null default '{}'::jsonb,
  primary key (family_id, month)
);

create table category_rules (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families (id) on delete cascade,
  pattern text not null,
  category_id uuid not null references categories (id) on delete cascade,
  unique (family_id, pattern)
);

-- ============================================================
-- Helper: familia del usuario autenticado
-- ============================================================

create or replace function current_family_id()
returns uuid
language sql
stable
security definer
set search_path = family, public
as $$
  select family_id from profiles where user_id = auth.uid()
$$;

-- ============================================================
-- RLS
-- ============================================================

alter table families enable row level security;
alter table profiles enable row level security;
alter table categories enable row level security;
alter table pets enable row level security;
alter table recurring_expenses enable row level security;
alter table recurring_incomes enable row level security;
alter table import_batches enable row level security;
alter table transactions enable row level security;
alter table transaction_pet_splits enable row level security;
alter table savings_accounts enable row level security;
alter table savings_movements enable row level security;
alter table savings_plans enable row level security;
alter table month_closures enable row level security;
alter table category_rules enable row level security;

create policy "family members" on families
  for all using (id = current_family_id()) with check (id = current_family_id());

create policy "own family profiles" on profiles
  for select using (family_id = current_family_id());
create policy "own profile" on profiles
  for update using (user_id = auth.uid());

create policy "family scope" on categories
  for all using (family_id = current_family_id()) with check (family_id = current_family_id());
create policy "family scope" on pets
  for all using (family_id = current_family_id()) with check (family_id = current_family_id());
create policy "family scope" on recurring_expenses
  for all using (family_id = current_family_id()) with check (family_id = current_family_id());
create policy "family scope" on recurring_incomes
  for all using (family_id = current_family_id()) with check (family_id = current_family_id());
create policy "family scope" on import_batches
  for all using (family_id = current_family_id()) with check (family_id = current_family_id());
create policy "family scope" on transactions
  for all using (family_id = current_family_id()) with check (family_id = current_family_id());
create policy "family scope" on savings_accounts
  for all using (family_id = current_family_id()) with check (family_id = current_family_id());
create policy "family scope" on savings_movements
  for all using (family_id = current_family_id()) with check (family_id = current_family_id());
create policy "family scope" on savings_plans
  for all using (family_id = current_family_id()) with check (family_id = current_family_id());
create policy "family scope" on month_closures
  for all using (family_id = current_family_id()) with check (family_id = current_family_id());
create policy "family scope" on category_rules
  for all using (family_id = current_family_id()) with check (family_id = current_family_id());

create policy "family scope" on transaction_pet_splits
  for all using (
    exists (
      select 1 from transactions t
      where t.id = transaction_id and t.family_id = current_family_id()
    )
  ) with check (
    exists (
      select 1 from transactions t
      where t.id = transaction_id and t.family_id = current_family_id()
    )
  );

-- ============================================================
-- Onboarding: crear familia o unirse (security definer, se llaman
-- desde el signup con el usuario ya autenticado pero sin profile)
-- ============================================================

create or replace function seed_family_defaults(fam_id uuid)
returns void
language plpgsql
security definer
set search_path = family, public
as $$
begin
  insert into categories (family_id, name, icon, kind) values
    (fam_id, 'Hogar', 'home', 'expense'),
    (fam_id, 'Comida', 'shopping-cart', 'expense'),
    (fam_id, 'Gas', 'flame', 'expense'),
    (fam_id, 'Agua', 'droplets', 'expense'),
    (fam_id, 'Luz', 'zap', 'expense'),
    (fam_id, 'Internet y móvil', 'wifi', 'expense'),
    (fam_id, 'Mascotas', 'paw-print', 'expense'),
    (fam_id, 'Coche', 'car', 'expense'),
    (fam_id, 'Salud', 'heart-pulse', 'expense'),
    (fam_id, 'Ocio', 'party-popper', 'expense'),
    (fam_id, 'Colegio', 'graduation-cap', 'expense'),
    (fam_id, 'Otros', 'circle-ellipsis', 'expense'),
    (fam_id, 'Nómina', 'briefcase', 'income'),
    (fam_id, 'Rentas', 'building', 'income'),
    (fam_id, 'Extraordinario', 'sparkles', 'income');
  insert into savings_accounts (family_id, name) values (fam_id, 'Hucha');
  insert into savings_plans (family_id, monthly_target) values (fam_id, 0);
end;
$$;

create or replace function create_family(family_name text, display_name text, uname text)
returns uuid
language plpgsql
security definer
set search_path = family, public
as $$
declare
  fam_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if exists (select 1 from profiles where user_id = auth.uid()) then
    raise exception 'user already has a family';
  end if;
  insert into families (name) values (family_name) returning id into fam_id;
  insert into profiles (user_id, family_id, display_name, username)
    values (auth.uid(), fam_id, display_name, uname);
  perform seed_family_defaults(fam_id);
  return fam_id;
end;
$$;

create or replace function join_family(code text, display_name text, uname text)
returns uuid
language plpgsql
security definer
set search_path = family, public
as $$
declare
  fam_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if exists (select 1 from profiles where user_id = auth.uid()) then
    raise exception 'user already has a family';
  end if;
  select id into fam_id from families where invite_code = upper(code);
  if fam_id is null then
    raise exception 'invalid invite code';
  end if;
  insert into profiles (user_id, family_id, display_name, username)
    values (auth.uid(), fam_id, display_name, uname);
  return fam_id;
end;
$$;

-- Comprobar si un username existe (para el login user→pseudo-email sin sesión)
create or replace function username_exists(uname text)
returns boolean
language sql
stable
security definer
set search_path = family, public
as $$
  select exists (select 1 from profiles where username = uname)
$$;

-- ============================================================
-- Grants (PostgREST accede con anon/authenticated; RLS sigue aplicando)
-- ============================================================

grant all on all tables in schema family to anon, authenticated, service_role;
grant all on all sequences in schema family to anon, authenticated, service_role;
grant execute on all functions in schema family to anon, authenticated, service_role;
alter default privileges in schema family grant all on tables to anon, authenticated, service_role;
alter default privileges in schema family grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema family grant execute on functions to anon, authenticated, service_role;
