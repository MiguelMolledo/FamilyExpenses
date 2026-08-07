import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  eur,
  monthStart,
  type PersonalAllowance,
  type PersonalMovement,
  type Profile,
} from "@/lib/types";
import { buildPot } from "@/lib/paga";
import { PersonalMovementDialog } from "@/components/paga/personal-movement-dialog";
import { PersonalMovementsList } from "@/components/paga/personal-movements-list";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Wallet, Plus } from "lucide-react";

export default async function PagaPage() {
  const supabase = await createClient();
  const month = monthStart(new Date());

  const [userQ, profilesQ, allowancesQ, movementsQ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("profiles").select("*").order("created_at"),
    supabase.from("personal_allowances").select("*"),
    supabase
      .from("personal_movements")
      .select("*")
      .order("date", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  const myId = userQ.data.user?.id;
  // El que mira primero: su paga arriba, la del resto debajo
  const profiles = ((profilesQ.data ?? []) as Profile[]).sort((a, b) =>
    a.user_id === myId ? -1 : b.user_id === myId ? 1 : 0
  );
  const allowances = (allowancesQ.data ?? []) as PersonalAllowance[];
  const movements = (movementsQ.data ?? []) as PersonalMovement[];

  const anyConfigured = allowances.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Mi dinero</h1>

      {!anyConfigured && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Nadie tiene paga personal configurada todavía.{" "}
            <Link href="/ajustes" className="text-primary underline">
              Configúrala en Ajustes
            </Link>
            .
          </CardContent>
        </Card>
      )}

      {profiles.map((p) => {
        const own = allowances.filter((a) => a.profile_id === p.user_id);
        const ownMovements = movements.filter(
          (m) => m.profile_id === p.user_id
        );
        if (own.length === 0 && ownMovements.length === 0) return null;
        const pot = buildPot(own, ownMovements, month);

        return (
          <section key={p.user_id} className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">
                {p.display_name}
                {p.user_id === myId && (
                  <span className="ml-1 text-sm font-normal text-muted-foreground">
                    (tú)
                  </span>
                )}
              </h2>
              <PersonalMovementDialog
                profileId={p.user_id}
                profileName={p.display_name}
                currentBalance={pot.balance}
              >
                <Button size="sm" variant="outline">
                  <Plus className="size-4" />
                  Movimiento
                </Button>
              </PersonalMovementDialog>
            </div>

            <Card>
              <CardContent className="pt-6 text-center">
                <Wallet className="mx-auto mb-1 size-8 text-violet-500" />
                <p className="text-sm text-muted-foreground">Disponible</p>
                <p className="text-4xl font-bold">{eur(pot.balance)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {pot.monthly > 0
                    ? `${eur(pot.monthly)} al mes · lo que no se gasta se acumula`
                    : "Sin paga vigente"}
                  {pot.spentThisMonth > 0 &&
                    ` · gastado este mes ${eur(pot.spentThisMonth)}`}
                </p>
              </CardContent>
            </Card>

            <PersonalMovementsList movements={ownMovements} />
          </section>
        );
      })}
    </div>
  );
}
