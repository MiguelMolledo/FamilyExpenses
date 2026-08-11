-- Presupuesto de chat (LLM) por familia, para la cuenta pública de ejemplo.
--
-- families.chat_budget_cents: tope mensual en céntimos (null = sin límite;
-- la familia Ejemplo lleva 100 = 1 €/mes). El gasto se acumula en chat_usage
-- por familia y mes, SOLO vía la función record_chat_usage (security definer,
-- que solo suma): un invitado no puede ponerse el contador a cero ni subirse
-- el tope — el UPDATE de families queda restringido por columnas a `name`.

set search_path = family, public;

alter table families add column chat_budget_cents numeric(8, 2)
  check (chat_budget_cents is null or chat_budget_cents >= 0);

-- Un miembro no puede tocarse el presupuesto de chat (ni el invite_code)
revoke update on families from authenticated;
grant update (name) on families to authenticated;

create table chat_usage (
  family_id uuid not null references families (id) on delete cascade,
  month date not null, -- siempre día 1 (mes Europe/Madrid)
  cents numeric(10, 2) not null default 0,
  requests int not null default 0,
  primary key (family_id, month)
);

alter table chat_usage enable row level security;
-- Solo lectura para los miembros; las escrituras van por record_chat_usage
create policy "family scope" on chat_usage
  for select using (family_id = (select current_family_id()));
revoke insert, update, delete on chat_usage from authenticated;

create or replace function record_chat_usage(amount_cents numeric)
returns void
language plpgsql
security definer
set search_path = family, public
as $$
declare
  fam uuid;
begin
  fam := current_family_id();
  if fam is null then
    raise exception 'no family';
  end if;
  -- Solo importes razonables y siempre sumando (nunca resta ni resetea)
  if amount_cents is null or amount_cents < 0 or amount_cents > 1000 then
    raise exception 'invalid amount';
  end if;
  insert into chat_usage (family_id, month, cents, requests)
  values (
    fam,
    date_trunc('month', (now() at time zone 'Europe/Madrid'))::date,
    amount_cents,
    1
  )
  on conflict (family_id, month) do update
    set cents = chat_usage.cents + excluded.cents,
        requests = chat_usage.requests + 1;
end;
$$;

revoke execute on function record_chat_usage(numeric) from public;
grant execute on function record_chat_usage(numeric) to authenticated;
