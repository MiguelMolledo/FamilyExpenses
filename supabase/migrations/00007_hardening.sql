-- Endurecimiento de seguridad + limpieza del modelo de fijos + índices.
--
-- 1. Un usuario ya no puede cambiarse de familia editando su profile (era el
--    agujero gordo: current_family_id() lee de profiles, así que actualizar
--    family_id daba acceso total a otra familia).
-- 2. anon pierde todo el DML: solo puede ejecutar username_exists (login).
--    Antes, cualquier tabla futura sin RLS quedaba abierta con la anon key.
-- 3. Los miembros no pueden borrar la familia entera (los cascade arrasaban
--    todo el histórico con un solo DELETE).
-- 4. seed_family_defaults solo la invoca create_family (como owner).
-- 5. invite_code con entropía criptográfica (gen_random_uuid, 48 bits).
-- 6. Fuera recurring_rules / recurring_expenses / recurring_expense_id:
--    muertos desde el modelo de sobres puro (backup en supabase/backups/).
-- 7. El índice parcial de dedup pasa a constraint único normal para que el
--    import pueda hacer un solo upsert con ON CONFLICT vía PostgREST
--    (los NULL siguen permitiéndose varias veces).
-- 8. Índices de soporte de FKs calientes.
-- 9. Policies con (select current_family_id()): InitPlan una vez por query
--    en vez de evaluar la función fila a fila.

set search_path = family, public;

-- ============================================================
-- 1. profiles: with check + solo columnas inofensivas
-- ============================================================

drop policy "own profile" on profiles;
create policy "own profile" on profiles
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke update on profiles from anon, authenticated;
grant update (display_name, username) on profiles to authenticated;

-- ============================================================
-- 2. anon sin DML ni funciones (salvo username_exists)
-- ============================================================

revoke all on all tables in schema family from anon;
revoke all on all sequences in schema family from anon;
revoke execute on all functions in schema family from anon;
grant execute on function username_exists(text) to anon;

alter default privileges in schema family revoke all on tables from anon;
alter default privileges in schema family revoke all on sequences from anon;
alter default privileges in schema family revoke execute on functions from anon;

-- ============================================================
-- 3. families: ver y editar sí, borrar no
-- ============================================================

drop policy "family members" on families;
create policy "family select" on families
  for select using (id = (select current_family_id()));
create policy "family update" on families
  for update using (id = (select current_family_id()))
  with check (id = (select current_family_id()));

revoke delete on families from authenticated;

-- ============================================================
-- 4. seed_family_defaults: solo interna
-- ============================================================

revoke execute on function seed_family_defaults(uuid) from anon, authenticated;

-- ============================================================
-- 5. invite_code criptográfico para familias nuevas
-- ============================================================

alter table families alter column invite_code
  set default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));

-- ============================================================
-- 6. Limpieza del modelo de fijos
-- ============================================================

drop table if exists recurring_rules;
alter table transactions drop column if exists recurring_expense_id;
drop table if exists recurring_expenses;

-- ============================================================
-- 7. dedup: de índice parcial a constraint único
-- ============================================================

drop index if exists transactions_dedup_idx;
alter table transactions add constraint transactions_family_dedup_key
  unique (family_id, dedup_hash);

-- ============================================================
-- 8. Índices de soporte de FK
-- ============================================================

create index if not exists transactions_category_idx on transactions (category_id);
create index if not exists transactions_subcategory_idx on transactions (subcategory_id);
create index if not exists transaction_pet_splits_pet_idx on transaction_pet_splits (pet_id);
create index if not exists category_rules_category_idx on category_rules (category_id);
create index if not exists category_rules_subcategory_idx on category_rules (subcategory_id);
create index if not exists savings_movements_account_idx on savings_movements (account_id);

-- ============================================================
-- 9. Policies con (select current_family_id())
-- ============================================================

do $$
declare t text;
begin
  foreach t in array array[
    'categories', 'pets', 'recurring_incomes', 'import_batches',
    'transactions', 'savings_accounts', 'savings_movements', 'savings_plans',
    'month_closures', 'category_rules', 'subcategories',
    'personal_allowances', 'personal_movements'
  ]
  loop
    execute format('drop policy "family scope" on %I', t);
    execute format(
      'create policy "family scope" on %I
         for all using (family_id = (select current_family_id()))
         with check (family_id = (select current_family_id()))', t);
  end loop;
end $$;

drop policy "family scope" on transaction_pet_splits;
create policy "family scope" on transaction_pet_splits
  for all using (
    exists (
      select 1 from transactions t
      where t.id = transaction_id
        and t.family_id = (select current_family_id())
    )
  ) with check (
    exists (
      select 1 from transactions t
      where t.id = transaction_id
        and t.family_id = (select current_family_id())
    )
  );

drop policy "own family profiles" on profiles;
create policy "own family profiles" on profiles
  for select using (family_id = (select current_family_id()));
