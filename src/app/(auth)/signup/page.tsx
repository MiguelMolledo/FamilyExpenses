"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  MIN_PASSWORD_LENGTH,
  usernameToEmail,
  normalizeUsername,
} from "@/lib/auth";
import { createAccount } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// El alta es SOLO por invitación: hace falta el código de una familia
// existente. Las familias nuevas se crean a mano (create_family por psql).
export default function SignupPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Enlace de invitación: /signup?codigo=XXXX deja el código ya puesto
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("codigo");
    if (code) setInviteCode(code);
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const uname = normalizeUsername(username);
    const email = usernameToEmail(uname);

    // El código se valida (en el servidor) ANTES de crear el usuario en Auth:
    // así un código erróneo no deja una cuenta huérfana a medio registrar.
    const { error: createError } = await createAccount({
      username,
      password,
      inviteCode,
    });
    if (createError) {
      setError(createError);
      setLoading(false);
      return;
    }

    // Si el usuario ya existía (reintento), esto comprueba su contraseña.
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError) {
      setError("Ese usuario ya existe y la contraseña no coincide");
      setLoading(false);
      return;
    }

    const { error: rpcError } = await supabase.rpc("join_family", {
      code: inviteCode.trim(),
      display_name: displayName,
      uname,
    });
    if (rpcError) {
      const msg = rpcError.message.includes("invalid invite code")
        ? "Código de invitación no válido"
        : rpcError.message.includes("already has a family")
          ? "Este usuario ya pertenece a una familia"
          : "No se pudo completar el registro: " + rpcError.message;
      setError(msg);
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="font-semibold">Unirme a una familia</h1>
            <p className="text-sm text-muted-foreground">
              Solo se puede entrar con invitación. Pide el código a alguien de
              la familia (está en Ajustes).
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="inviteCode">Código de invitación</Label>
            <Input
              id="inviteCode"
              placeholder="A1B2C3D4"
              autoCapitalize="characters"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="displayName">Tu nombre</Label>
            <Input
              id="displayName"
              placeholder="Miguel"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
          </div>
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
            {username && normalizeUsername(username) !== username && (
              <p className="text-xs text-muted-foreground">
                Se registrará como: {normalizeUsername(username) || "—"}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={loading}>
            {loading ? "Creando..." : "Unirme y entrar"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            ¿Ya tienes cuenta?{" "}
            <Link href="/login" className="underline">
              Entra
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
