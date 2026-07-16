import { createClient } from "@/lib/supabase/server";
import { FamilySection } from "@/components/ajustes/family-section";
import { CategoriesSection } from "@/components/ajustes/categories-section";
import { PetsSection } from "@/components/ajustes/pets-section";
import { SavingsTargetSection } from "@/components/ajustes/savings-target-section";
import { LogoutButton } from "@/components/ajustes/logout-button";

export default async function AjustesPage() {
  const supabase = await createClient();
  const [family, profiles, categories, pets, plan] = await Promise.all([
    supabase.from("families").select("*").single(),
    supabase.from("profiles").select("*").order("created_at"),
    supabase.from("categories").select("*").order("kind").order("name"),
    supabase.from("pets").select("*").order("created_at"),
    supabase.from("savings_plans").select("*").single(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Ajustes</h1>
        <LogoutButton />
      </div>
      <FamilySection family={family.data} members={profiles.data ?? []} />
      <SavingsTargetSection plan={plan.data} />
      <PetsSection pets={pets.data ?? []} />
      <CategoriesSection categories={categories.data ?? []} />
    </div>
  );
}
