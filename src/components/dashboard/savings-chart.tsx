import { eur } from "@/lib/types";

const MONTH_LABELS = ["E", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

/**
 * Ahorro del año: línea/área del saldo real acumulado de la hucha frente a la
 * línea de objetivo (saldo inicial + objetivo mensual × meses). SVG a mano.
 */
export function SavingsChart({
  real,
  expected,
  currentIdx,
}: {
  real: (number | null)[]; // saldo a fin de cada mes; null en meses futuros
  expected: number[]; // saldo objetivo a fin de cada mes
  currentIdx: number; // 0-based, mes actual
}) {
  const W = 320;
  const H = 150;
  const PAD = { top: 12, right: 8, bottom: 18, left: 8 };
  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;

  const values = [...real.filter((v): v is number => v !== null), ...expected];
  const min = Math.min(0, ...values);
  const max = Math.max(1, ...values) * 1.05;
  const x = (i: number) => PAD.left + (i / 11) * iw;
  const y = (v: number) => PAD.top + ih - ((v - min) / (max - min)) * ih;

  const realPts = real
    .map((v, i) => (v === null ? null : `${x(i)},${y(v)}`))
    .filter(Boolean);
  const realLine = realPts.join(" ");
  let lastRealIdx = -1;
  real.forEach((v, i) => {
    if (v !== null) lastRealIdx = i;
  });
  const area =
    realPts.length > 1
      ? `${realLine} ${x(lastRealIdx)},${y(Math.max(0, min))} ${x(0)},${y(Math.max(0, min))}`
      : "";
  const expectedLine = expected.map((v, i) => `${x(i)},${y(v)}`).join(" ");

  const lastReal = lastRealIdx >= 0 ? real[lastRealIdx]! : 0;
  const expectedNow = expected[Math.max(currentIdx, 0)] ?? 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span
            className="size-2.5 rounded-full"
            style={{ background: "var(--viz-5)" }}
          />
          Real: <strong className="text-foreground">{eur(lastReal)}</strong>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 border-t-2 border-dashed border-muted-foreground" />
          Objetivo: <strong className="text-foreground">{eur(expectedNow)}</strong>
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label="Ahorro acumulado del año frente al objetivo"
      >
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={PAD.left}
            x2={W - PAD.right}
            y1={PAD.top + ih * f}
            y2={PAD.top + ih * f}
            className="stroke-border"
            strokeWidth="1"
          />
        ))}
        {area && (
          <polygon points={area} fill="var(--viz-5)" opacity="0.15" />
        )}
        <polyline
          points={expectedLine}
          fill="none"
          strokeWidth="2"
          strokeDasharray="4 4"
          className="stroke-muted-foreground"
        />
        {realPts.length > 0 && (
          <polyline
            points={realLine}
            fill="none"
            stroke="var(--viz-5)"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        )}
        {lastRealIdx >= 0 && (
          <circle
            cx={x(lastRealIdx)}
            cy={y(lastReal)}
            r="4"
            fill="var(--viz-5)"
            className="stroke-card"
            strokeWidth="2"
          />
        )}
        {MONTH_LABELS.map((l, i) => (
          <text
            key={i}
            x={x(i)}
            y={H - 4}
            textAnchor="middle"
            fontSize="9"
            className={
              i === currentIdx
                ? "fill-foreground font-bold"
                : "fill-muted-foreground"
            }
          >
            {l}
          </text>
        ))}
        {real.map((v, i) => (
          <rect
            key={i}
            x={x(i) - iw / 24}
            y={PAD.top}
            width={iw / 12}
            height={ih}
            fill="transparent"
          >
            <title>
              {`${MONTH_LABELS[i]}: real ${v === null ? "—" : eur(v)} · objetivo ${eur(expected[i])}`}
            </title>
          </rect>
        ))}
      </svg>
    </div>
  );
}
