"use server";

import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  MIN_PASSWORD_LENGTH,
  normalizeUsername,
  usernameToEmail,
} from "@/lib/auth";

/**
 * Crea la cuenta de Auth en el servidor. El proyecto de Supabase se comparte
 * con otras apps y tiene el registro público desactivado, así que el alta va
 * con la service role y marcada con `app_metadata.app = "family"` (el resto de
 * apps ignoran a esos usuarios). Solo con un código de invitación válido.
 */
export async function createAccount(input: {
  username: string;
  password: string;
  inviteCode: string;
}): Promise<{ error: string | null }> {
  const uname = normalizeUsername(input.username);
  if (uname.length < 3) {
    return { error: "El usuario debe tener al menos 3 caracteres (letras/números)" };
  }
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    return {
      error: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`,
    };
  }

  const supabase = await createClient();
  const { data: codeOk, error: codeError } = await supabase.rpc(
    "invite_code_valid",
    { code: input.inviteCode.trim() }
  );
  if (codeError || !codeOk) return { error: "Código de invitación no válido" };

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  const { error } = await admin.auth.admin.createUser({
    email: usernameToEmail(uname),
    password: input.password,
    email_confirm: true,
    // En los dos: el trigger AFTER INSERT solo ve user_metadata (app_metadata
    // lo escribe Auth en un UPDATE posterior); los guardas de sesión miran
    // app_metadata, que el usuario no puede cambiar.
    app_metadata: { app: "family" },
    user_metadata: { app: "family" },
  });
  // Si ya existía (reintento tras un fallo en join_family) el cliente intenta
  // entrar con la contraseña; si no coincide, ahí se le avisa.
  if (error && error.code !== "email_exists") {
    return { error: "No se pudo crear la cuenta: " + error.message };
  }
  return { error: null };
}
