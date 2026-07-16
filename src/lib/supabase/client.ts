import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    // Las tablas de FamilyExpenses viven en el schema `family`
    // (proyecto Supabase compartido con otras apps).
    { db: { schema: "family" } }
  );
}
