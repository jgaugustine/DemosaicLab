import React from 'react';

interface KernelCellData {
  r: number;
  g: number;
  b: number;
  weight: number;
  label?: string;
}

interface KernelMultiplicationDiagramProps {
  title: string;
  size: number;
  cells: KernelCellData[];
  totals?: { r: number; g: number; b: number };
  highlightColor?: { r: number; g: number; b: number };
}

const formatWeight = (value: number) => {
  if (Math.abs(value) < 1e-6) return '0';
  if (Math.abs(value) >= 10) return value.toFixed(0);
  if (Math.abs(value) >= 1) return value.toFixed(2);
  return value.toFixed(3);
};

const formatVector = (r: number, g: number, b: number) => {
  const f = (n: number) => Math.round(n).toString().padStart(3, '\u00A0');
  return `(${f(r)}, ${f(g)}, ${f(b)})`;
};

export const KernelMultiplicationDiagram: React.FC<KernelMultiplicationDiagramProps> = ({
  title,
  size,
  cells,
  totals,
  highlightColor,
}) => {
  const gridTemplate = { gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` };

  const highlight =
    highlightColor &&
    `rgba(${highlightColor.r}, ${highlightColor.g}, ${highlightColor.b}, 0.15)`;

  // Use flex layout if we have fewer cells (filtered), grid otherwise
  const useFlex = cells.length < size * size;

  return (
    <div className="space-y-2 w-full">
      <div className="text-xs font-semibold text-foreground">{title}</div>
      <div className={useFlex ? "flex flex-wrap gap-2 w-full" : "grid gap-2 w-full"} style={useFlex ? {} : gridTemplate}>
        {cells.map((cell, idx) => {
          const isZeroWeight = Math.abs(cell.weight) < 1e-6;
          return (
            <div key={idx} className="relative">
              <div
                className={`rounded border border-border bg-card/60 px-2 py-1 text-center shadow-sm flex flex-col gap-1 justify-between items-stretch ${isZeroWeight ? 'opacity-30' : ''}`}
                style={{
                  backgroundColor: highlight ?? undefined,
                  minHeight: 70,
                }}
              >
                <div className="text-[10px] font-mono text-foreground whitespace-nowrap">
                  {cell.label || formatVector(cell.r, cell.g, cell.b)}
                </div>
                <div className="text-[10px] text-muted-foreground whitespace-nowrap">
                  × {formatWeight(cell.weight)}
                </div>
                <div
                  className="h-3 w-full rounded border border-border/40"
                  style={{
                    backgroundColor: `rgb(${cell.r}, ${cell.g}, ${cell.b})`,
                  }}
                />
              </div>
              {idx !== cells.length - 1 && (
                <span className="pointer-events-none absolute -right-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-white/50">
                  +
                </span>
              )}
            </div>
          );
        })}
      </div>
      {totals && (
        <div className="text-xs font-mono text-right text-foreground">
          = {formatVector(totals.r, totals.g, totals.b)}
        </div>
      )}
    </div>
  );
};

export default KernelMultiplicationDiagram;
