"use client";

import { toast } from "sonner";
import { Copy } from "lucide-react";
import type { Family, Profile } from "@/lib/types";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function FamilySection({
  family,
  members,
}: {
  family: Family | null;
  members: Profile[];
}) {
  if (!family) return null;

  async function copyCode() {
    await navigator.clipboard.writeText(family!.invite_code);
    toast.success("Código copiado");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Familia {family.name}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">
              Código de invitación
            </p>
            <p className="font-mono text-lg font-semibold">
              {family.invite_code}
            </p>
          </div>
          <Button variant="outline" size="icon" onClick={copyCode}>
            <Copy className="size-4" />
          </Button>
        </div>
        <div>
          <p className="mb-1 text-sm text-muted-foreground">Miembros</p>
          <div className="flex flex-wrap gap-2">
            {members.map((m) => (
              <Badge key={m.user_id} variant="secondary">
                {m.display_name} · {m.username}
              </Badge>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
