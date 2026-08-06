-- Reglas aprendidas concepto→gasto fijo para el import de extractos,
-- mismas mecánicas que category_rules.

set search_path = family, public;

create table recurring_rules (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families (id) on delete cascade
    default current_family_id(),
  pattern text not null,
  recurring_expense_id uuid not null
    references recurring_expenses (id) on delete cascade,
  unique (family_id, pattern)
);

alter table recurring_rules enable row level security;

create policy "family scope" on recurring_rules
  for all using (family_id = current_family_id()) with check (family_id = current_family_id());
