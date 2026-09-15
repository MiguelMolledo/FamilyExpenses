"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  ArrowLeftRight,
  CalendarRange,
  PiggyBank,
  GitCompareArrows,
  PawPrint,
  FileUp,
  Settings,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LogoutButton } from "@/components/ajustes/logout-button";

const mainItems = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/movimientos", label: "Movimientos", icon: ArrowLeftRight },
  { href: "/presupuesto", label: "Presupuesto", icon: CalendarRange },
  { href: "/hucha", label: "Hucha", icon: PiggyBank },
];

const moreItems = [
  { href: "/paga", label: "Mi dinero", icon: Wallet },
  { href: "/comparar", label: "Comparar meses", icon: GitCompareArrows },
  { href: "/mascotas", label: "Mascotas", icon: PawPrint },
  { href: "/importar", label: "Importar PDF", icon: FileUp },
  { href: "/ajustes", label: "Ajustes", icon: Settings },
];

/**
 * Barra lateral de escritorio (≥ lg). En móvil sigue mandando la barra
 * inferior; aquí caben las nueve secciones sin menú «Más».
 */
export function SideNav({
  familyName,
  displayName,
  username,
}: {
  familyName: string;
  displayName: string;
  username: string;
}) {
  const pathname = usePathname();

  const NavLink = ({
    href,
    label,
    icon: Icon,
  }: {
    href: string;
    label: string;
    icon: typeof Home;
  }) => {
    const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
    return (
      <Link
        href={href}
        className={cn(
          "flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium",
          active
            ? "bg-sidebar-accent text-foreground"
            : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
        )}
      >
        <Icon className="size-4" />
        {label}
      </Link>
    );
  };

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col gap-4 border-r bg-sidebar px-3 py-4 lg:flex">
      <Link href="/" className="flex h-9 items-center gap-2.5 px-2.5">
        <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <PiggyBank className="size-4" />
        </span>
        <span className="flex flex-col leading-tight">
          <span className="text-sm font-semibold">FamilyExpenses</span>
          <span className="text-xs text-muted-foreground">{familyName}</span>
        </span>
      </Link>
      <nav className="flex flex-col gap-0.5">
        {mainItems.map((item) => (
          <NavLink key={item.href} {...item} />
        ))}
        <p className="px-2.5 pb-1 pt-4 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Más
        </p>
        {moreItems.map((item) => (
          <NavLink key={item.href} {...item} />
        ))}
      </nav>
      <div className="mt-auto flex items-center gap-2.5 border-t px-2.5 pt-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold uppercase">
          {displayName.slice(0, 1)}
        </span>
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="truncate text-sm font-medium">{displayName}</span>
          <span className="truncate text-xs text-muted-foreground">{username}</span>
        </span>
        <LogoutButton iconOnly />
      </div>
    </aside>
  );
}
