-- Paga personal: dinero mensual de cada miembro que NO pasa por la cuenta
-- común (se retiene de la nómina antes de ingresarla, así que la nómina se
-- registra ya neta). Se devenga automáticamente cada mes y el sobrante se
-- acumula. El importe se versiona con starts_on/ends_on como los fijos.
-- Los gastos personales viven en su propio ledger (personal_movements),
-- fuera de `transactions`, para no contaminar el presupuesto familiar.

set search_path = family, public;

create table personal_allowances (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families (id) on delete cascade
    default current_family_id(),
  profile_id uuid not null references profiles (user_id) on delete cascade,
  amount numeric(12, 2) not null check (amount >= 0),
  starts_on date not null,
  ends_on date,
  created_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);

create table personal_movements (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families (id) on delete cascade
    default current_family_id(),
  profile_id uuid not null references profiles (user_id) on delete cascade,
  date date not null default current_date,
  -- firmado: gasto negativo, extra positivo, ajuste con su signo
  amount numeric(12, 2) not null,
  kind text not null check (kind in ('expense', 'extra', 'adjustment')),
  note text,
  created_at timestamptz not null default now()
);

create index personal_movements_profile_date_idx
  on personal_movements (profile_id, date);

alter table personal_allowances enable row level security;
alter table personal_movements enable row level security;

create policy "family scope" on personal_allowances
  for all using (family_id = current_family_id())
  with check (family_id = current_family_id());
create policy "family scope" on personal_movements
  for all using (family_id = current_family_id())
  with check (family_id = current_family_id());

grant all on personal_allowances, personal_movements
  to anon, authenticated, service_role;
