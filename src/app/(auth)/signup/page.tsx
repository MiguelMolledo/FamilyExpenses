"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { usernameToEmail, normalizeUsername } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

type Mode = "create" | "join";

export default function SignupPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("create");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const uname = normalizeUsername(username);
    const email = usernameToEmail(uname);

    if (uname.length < 3) {
      setError("El usuario debe tener al menos 3 caracteres (letras/números)");
      setLoading(false);
      return;
    }

    // Alta en Auth; si el usuario ya existía (reintento), intentamos entrar.
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    });
    if (signUpError) {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        setError("Ese usuario ya existe o la contraseña no es válida (mín. 6 caracteres)");
        setLoading(false);
        return;
      }
    }

    const rpc =
      mode === "create"
        ? supabase.rpc("create_family", {
            family_name: familyName,
            display_name: displayName,
            uname,
          })
        : supabase.rpc("join_family", {
            code: inviteCode,
            display_name: displayName,
            uname,
          });

    const { error: rpcError } = await rpc;
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
        <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
          <TabsList className="mb-4 w-full">
            <TabsTrigger value="create" className="flex-1">
              Crear familia
            </TabsTrigger>
            <TabsTrigger value="join" className="flex-1">
              Unirme a una
            </TabsTrigger>
          </TabsList>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <TabsContent value="create" className="m-0">
              <div className="flex flex-col gap-2">
                <Label htmlFor="familyName">Nombre de la familia</Label>
                <Input
                  id="familyName"
                  placeholder="Los Molledo"
                  value={familyName}
                  onChange={(e) => setFamilyName(e.target.value)}
                  required={mode === "create"}
                />
              </div>
            </TabsContent>
            <TabsContent value="join" className="m-0">
              <div className="flex flex-col gap-2">
                <Label htmlFor="inviteCode">Código de invitación</Label>
                <Input
                  id="inviteCode"
                  placeholder="A1B2C3D4"
                  autoCapitalize="characters"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  required={mode === "join"}
                />
              </div>
            </TabsContent>
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
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={loading}>
              {loading
                ? "Creando..."
                : mode === "create"
                  ? "Crear familia y entrar"
                  : "Unirme y entrar"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              ¿Ya tienes cuenta?{" "}
              <Link href="/login" className="underline">
                Entra
              </Link>
            </p>
          </form>
        </Tabs>
      </CardContent>
    </Card>
  );
}
