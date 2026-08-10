# Autenticación y familias

Usuarios con username + contraseña (sin email real) agrupados en familias. Todos los datos se aíslan por familia con RLS.

## Capacidades

- Registro creando una familia nueva o uniéndose con código de invitación; login con username y contraseña.
- El username se normaliza (minúsculas, sin acentos ni símbolos, mínimo 3 caracteres) y se convierte en pseudo-email `@familyexpenses.local` para Supabase Auth; el formulario avisa si lo tecleado se normalizará.
- Todos los miembros de la familia ven y editan los mismos datos (movimientos, presupuestos, hucha…).
- El middleware (`proxy.ts`) redirige a /login sin sesión y expulsa de /login a quien ya la tiene (/signup queda accesible para completar registros a medias).

## Restricciones / seguridad

- Un usuario NO puede cambiarse de familia: el UPDATE de `profiles` está limitado por grants de columna a `display_name` y `username` (migración 00007). `current_family_id()` lee de profiles y es la base de todo el aislamiento.
- El rol `anon` no tiene DML sobre ninguna tabla del schema `family`; solo puede ejecutar `username_exists` (para el login). Las funciones de onboarding (`create_family`, `join_family`) exigen usuario autenticado.
- Ningún miembro puede borrar la familia entera (sin policy de DELETE en `families`).
- `invite_code`: 12 hex criptográficos para familias nuevas (las antiguas conservan el suyo de 8).
- El signup es público y sin verificación de email: cualquiera puede crear cuenta y familia (y usar el chat, que gasta OpenRouter). Pendiente decidir si cerrarlo.
- Las tablas viven en el schema Postgres `family` dentro del proyecto Supabase de GymStats (free tier); los clientes usan `db: { schema: "family" }`.

## Specs relacionados

- Todos: el aislamiento por familia aplica a cada sistema.

## Source

- [src/lib/auth.ts](../src/lib/auth.ts)
- [src/app/(auth)/](../src/app/(auth)/)
- [src/proxy.ts](../src/proxy.ts)
- [supabase/migrations/00001_initial_schema.sql](../supabase/migrations/00001_initial_schema.sql)
- [supabase/migrations/00007_hardening.sql](../supabase/migrations/00007_hardening.sql)
