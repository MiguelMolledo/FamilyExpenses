export type Family = {
  id: string;
  name: string;
  invite_code: string;
};

export type Profile = {
  user_id: string;
  family_id: string;
  display_name: string;
  username: string;
};

export type Category = {
  id: string;
  family_id: string;
  name: string;
  icon: string | null;
  kind: "expense" | "income";
};

export type Pet = {
  id: string;
  family_id: string;
  name: string;
  default_split_pct: number;
};

export type RecurringExpense = {
  id: string;
  family_id: string;
  category_id: string | null;
  name: string;
  amount: number;
  period: "monthly" | "annual";
  starts_on: string;
  ends_on: string | null;
};

export type RecurringIncome = {
  id: string;
  family_id: string;
  profile_id: string | null;
  name: string;
  type: "salary" | "rent" | "other";
  amount: number;
  starts_on: string;
  ends_on: string | null;
};

export type Transaction = {
  id: string;
  family_id: string;
  date: string;
  amount: number;
  type: "expense" | "income";
  category_id: string | null;
  description: string;
  recurring_expense_id: string | null;
  recurring_income_id: string | null;
  profile_id: string | null;
  is_extraordinary: boolean;
  import_batch_id: string | null;
  dedup_hash: string | null;
};

export type PetSplit = {
  transaction_id: string;
  pet_id: string;
  amount: number;
};

export type SavingsAccount = {
  id: string;
  family_id: string;
  name: string;
};

export type SavingsMovement = {
  id: string;
  account_id: string;
  family_id: string;
  date: string;
  amount: number;
  kind: "monthly" | "extra" | "withdrawal" | "interest";
  note: string | null;
};

export type SavingsPlan = {
  family_id: string;
  monthly_target: number;
};

export type MonthClosure = {
  family_id: string;
  month: string;
  closed_at: string;
  carryover: number;
  snapshot: Record<string, unknown>;
};

export type CategoryRule = {
  id: string;
  family_id: string;
  pattern: string;
  category_id: string;
};

/** Formatea un importe en EUR es-ES */
export function eur(n: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
  }).format(n);
}

/** 'YYYY-MM-01' del mes de una fecha */
export function monthStart(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
