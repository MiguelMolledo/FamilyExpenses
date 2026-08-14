-- El plan de ahorro sabe desde qué mes cuenta: antes el "vas +X/−X" del
-- dashboard asumía enero, y quien empieza a mitad de año salía en negativo.
-- null = desde siempre (comportamiento de antes).
alter table savings_plans
  add column if not exists starts_on date;
