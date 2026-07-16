export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4">
      <div className="mb-6 flex flex-col items-center gap-1">
        <div className="text-3xl">💶</div>
        <h1 className="text-2xl font-bold">FamilyExpenses</h1>
        <p className="text-sm text-muted-foreground">
          Las cuentas de la familia
        </p>
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
