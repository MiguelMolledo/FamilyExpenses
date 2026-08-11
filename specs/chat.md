# Chat asistente

Asistente IA flotante disponible en toda la app (botón burbuja), pensado para apuntar cosas rápido desde el móvil, también por voz.

## Capacidades

- El usuario puede dictar o escribir en español: «Añade 45 euros de la farmacia», «¿Cuánto llevamos en comida?».
- Tools disponibles: añadir gasto (con categoría+subcategoría de la taxonomía, flag de recibo fijo y reparto entre mascotas), añadir ingreso (vinculable a un ingreso recurrente; si no, extraordinario), movimiento de hucha, resumen del mes, presupuesto por categoría y búsqueda de movimientos con filtros.
- El reparto entre mascotas usa sus porcentajes por defecto y cuadra al céntimo con el total.
- La búsqueda devuelve el total sobre TODOS los movimientos que cumplen el filtro aunque la lista mostrada se trunque a 100.
- Al terminar una respuesta (o fallar), la página se refresca por si la IA escribió en la base de datos.
- Si la API falla, aparece una burbuja de error con botón «Reintentar».
- Dictado por voz con Web Speech API (es-ES): hablar, soltar y se envía solo.

## Restricciones

- Modelo vía OpenRouter (`OPENROUTER_MODEL`, por defecto claude-haiku-4.5; la demo usa gpt-5.6-luna). Máximo 8 pasos de tools por turno.
- Presupuesto de IA por familia (`families.chat_budget_cents`, null = sin límite; la Familia Ejemplo lleva 100 = 1 €/mes). El coste se estima por tokens (precios configurables con `OPENROUTER_PRICE_IN_USD_PER_M` / `OPENROUTER_PRICE_OUT_USD_PER_M`, suelo de 0,2 cts/petición) y se acumula en `chat_usage` vía `record_chat_usage` (solo suma: un invitado no puede resetear el contador ni subirse el tope). Al agotarse: 429 con mensaje claro y el resto de la app sigue funcionando.
- «Hoy» y «mes actual» se calculan en Europe/Madrid.
- El historial del chat vive en memoria: se pierde al recargar la página.

## Specs relacionados

- [Presupuesto](./presupuesto.md) — modelo que el sistema prompt explica a la IA

## Source

- [src/app/api/chat/route.ts](../src/app/api/chat/route.ts)
- [src/components/chat/chat-float.tsx](../src/components/chat/chat-float.tsx)
