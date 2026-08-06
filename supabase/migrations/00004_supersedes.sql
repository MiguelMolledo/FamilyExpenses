-- Versionado de fijos: la versión futura apunta a la que sustituye.
-- El índice único garantiza como mucho UNA versión futura por fijo,
-- aunque el usuario reintente la edición.

set search_path = family, public;

alter table recurring_expenses
  add column supersedes_id uuid references recurring_expenses (id) on delete set null;

create unique index recurring_expenses_supersedes_idx
  on recurring_expenses (supersedes_id)
  where supersedes_id is not null;
