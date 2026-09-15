import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BottomNav } from "@/components/bottom-nav";
import { SideNav } from "@/components/side-nav";
import { ChatFloat } from "@/components/chat/chat-float";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("family_id, display_name, username")
    .eq("user_id", user.id)
    .maybeSingle();
  // Usuario autenticado pero sin familia (registro a medias): que lo complete.
  if (!profile) redirect("/signup");

  const { data: family } = await supabase
    .from("families")
    .select("name")
    .eq("id", profile.family_id)
    .maybeSingle();

  return (
    <div className="flex min-h-dvh flex-col">
      <SideNav
        familyName={family?.name ?? ""}
        displayName={profile.display_name}
        username={profile.username}
      />
      {/* En escritorio el contenido deja sitio a la barra lateral y, con el
          asistente abierto, al panel acoplado a la derecha. El wrapper es un
          contenedor de consultas: cada vista se reorganiza según el ancho
          real que le queda, no según el de la ventana. */}
      <main className="flex-1 lg:pl-60 lg:[[data-chat-open]_&]:pr-[400px]">
        <div className="@container mx-auto w-full max-w-lg px-4 pb-24 pt-4 lg:max-w-[1200px] lg:px-10 lg:pt-8">
          {children}
        </div>
      </main>
      <ChatFloat />
      <BottomNav />
    </div>
  );
}
