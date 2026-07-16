/** Dominio ficticio para convertir usernames en emails de Supabase Auth. */
const PSEUDO_DOMAIN = "familyexpenses.local";

export function usernameToEmail(username: string): string {
  return `${normalizeUsername(username)}@${PSEUDO_DOMAIN}`;
}

/** Solo minúsculas, números y . _ - (parte local de email válida). */
export function normalizeUsername(username: string): string {
  return username
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "");
}
