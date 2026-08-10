"use client";

import { Input } from "@/components/ui/input";

/**
 * Campo de importe que acepta coma decimal. Un <input type="number"> con el
 * teclado español (la tecla decimal es la coma) deja el value vacío al teclear
 * "12,50"; aquí es texto con teclado decimal y se parsea con parseAmount().
 */
export function AmountInput(props: React.ComponentProps<typeof Input>) {
  return (
    <Input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      {...props}
    />
  );
}
