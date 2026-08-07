import { createClient } from "@/lib/supabase/server";
import { FamilySection } from "@/components/ajustes/family-section";
import { CategoriesSection } from "@/components/ajustes/categories-section";
import { PetsSection } from "@/components/ajustes/pets-section";
import { SavingsTargetSection } from "@/components/ajustes/savings-target-section";
import { PersonalAllowancesSection } from "@/components/ajustes/personal-allowances-section";
import { LogoutButton } from "@/components/ajustes/logout-button";

export default async function AjustesPage() {
  const supabase = await createClient();
  const [family, profiles, categories, subcategories, pets, plan, allowances] =
    await Promise.all([
      supabase.from("families").select("*").single(),
      supabase.from("profiles").select("*").order("created_at"),
      supabase.from("categories").select("*").order("name"),
      supabase.from("subcategories").select("*").order("name"),
      supabase.from("pets").select("*").order("created_at"),
      supabase.from("savings_plans").select("*").single(),
      supabase.from("personal_allowances").select("*"),
    ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Ajustes</h1>
        <LogoutButton />
      </div>
      <FamilySection family={family.data} members={profiles.data ?? []} />
      <SavingsTargetSection plan={plan.data} />
      <PersonalAllowancesSection
        members={profiles.data ?? []}
        allowances={allowances.data ?? []}
      />
      <PetsSection pets={pets.data ?? []} />
      <CategoriesSection
        categories={categories.data ?? []}
        subcategories={subcategories.data ?? []}
      />
    </div>
  );
}
