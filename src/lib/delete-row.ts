import { createClient } from "@/lib/supabase/client";

/**
 * DELETE con un reintento tras refrescar la sesión: el primer intento después
 * de un rato inactivo puede fallar por token caducado.
 */
export async function deleteRow(table: string, id: string) {
  const supabase = createClient();
  let { error } = await supabase.from(table).delete().eq("id", id);
  if (error) {
    await supabase.auth.refreshSession();
    ({ error } = await supabase.from(table).delete().eq("id", id));
  }
  return { error };
}
