-- family_id se rellena solo con la familia del usuario autenticado.
-- Así los inserts desde la app no necesitan pasarlo y RLS lo valida igual.

set search_path = family, public;

alter table categories alter column family_id set default current_family_id();
alter table pets alter column family_id set default current_family_id();
alter table recurring_expenses alter column family_id set default current_family_id();
alter table recurring_incomes alter column family_id set default current_family_id();
alter table import_batches alter column family_id set default current_family_id();
alter table transactions alter column family_id set default current_family_id();
alter table savings_accounts alter column family_id set default current_family_id();
alter table savings_movements alter column family_id set default current_family_id();
alter table savings_plans alter column family_id set default current_family_id();
alter table month_closures alter column family_id set default current_family_id();
alter table category_rules alter column family_id set default current_family_id();
