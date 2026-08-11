-- Alta solo por invitación + cierre del resquicio PUBLIC en funciones.
--
-- 1. En Postgres las funciones nacen ejecutables por PUBLIC (entry `=X` en el
--    ACL), así que el revoke a anon del 00007 no cerraba nada por sí solo:
--    seed_family_defaults seguía siendo invocable por cualquiera. PUBLIC fuera
--    de todas las funciones y re-grants mínimos explícitos.
-- 2. Ya no se pueden crear familias desde la app: el registro exige un código
--    de invitación de una familia existente (decisión de Miguel, 2026-08-11).
--    create_family sigue existiendo para uso manual (psql/service_role).
-- 3. invite_code_valid permite al signup validar el código ANTES de crear el
--    usuario en Auth, para no dejar cuentas huérfanas si el código está mal.

set search_path = family, public;

-- ============================================================
-- 1. PUBLIC sin execute en ninguna función
-- ============================================================

revoke execute on all functions in schema family from public;
alter default privileges in schema family revoke execute on functions from public;

-- Re-grants mínimos (los grants explícitos de authenticated/service_role
-- del 00001 siguen vigentes; estos son los que importan):
grant execute on function current_family_id() to authenticated; -- policies y defaults
grant execute on function username_exists(text) to anon, authenticated; -- login
grant execute on function join_family(text, text, text) to authenticated;

-- ============================================================
-- 2. Alta solo por invitación
-- ============================================================

revoke execute on function create_family(text, text, text) from anon, authenticated;

-- ============================================================
-- 3. Validación previa del código en el signup
-- ============================================================

create or replace function invite_code_valid(code text)
returns boolean
language sql
stable
security definer
set search_path = family, public
as $$
  select exists (select 1 from families where invite_code = upper(code))
$$;

revoke execute on function invite_code_valid(text) from public;
grant execute on function invite_code_valid(text) to anon, authenticated;
