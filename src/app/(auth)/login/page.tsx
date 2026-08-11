"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { usernameToEmail } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function signIn(email: string, pass: string): Promise<boolean> {
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: pass,
    });
    if (error) {
      setLoading(false);
      return false;
    }
    router.push("/");
    router.refresh();
    return true;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const ok = await signIn(usernameToEmail(username), password);
    if (!ok) setError("Usuario o contraseña incorrectos");
  }

  // Cuenta pública de ejemplo: familia "Ejemplo" con presupuesto de IA de
  // 1 €/mes (capado en servidor). Las credenciales son públicas a propósito.
  async function tryExample() {
    const ok = await signIn(usernameToEmail("ejemplo"), "ejemplo1234");
    if (!ok) setError("La cuenta de ejemplo no está disponible ahora mismo");
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="username">Usuario</Label>
            <Input
              id="username"
              autoComplete="username"
              autoCapitalize="none"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={loading}>
            {loading ? "Entrando..." : "Entrar"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={tryExample}
          >
            Probar la app (cuenta de ejemplo)
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            ¿Tienes un código de invitación?{" "}
            <Link href="/signup" className="underline">
              Únete a tu familia
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
