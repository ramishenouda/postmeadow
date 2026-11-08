"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Subscribers over time: one series, so no legend (the title names it). Built to the
 * dataviz skill: 2px line, ~10% area wash, hairline solid grid, end dot with a 2px
 * surface ring, a direct label at the end only, a snapping crosshair with tooltip, and
 * a table view so nothing depends on hovering or on color.
 */

type Point = { day: string; total: number; gained: number; lost: number };

const SERIES = "#2a78d6"; // categorical slot 1 (validated vs the light surface)
const SURFACE = "#ffffff";
const GRID = "#e7e5e4";
const INK_SECONDARY = "#57534e";
const HEIGHT = 220;
const PAD = { top: 16, right: 48, bottom: 28, left: 44 };

const dayLabel = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });
const fmtDay = (day: string) => dayLabel.format(new Date(`${day}T00:00:00Z`));
const fmtNum = (n: number) =>
  n >= 10_000
    ? new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n)
    : n.toLocaleString("en");

/** 0 / clean step / … covering max, at most 4 gridlines. */
function niceTicks(max: number): number[] {
  if (max <= 0) return [0, 1];
  const rough = max / 3;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? pow * 10;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

export function SubscriberChart({ data }: { data: Point[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(280, entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const geo = useMemo(() => {
    const ticks = niceTicks(Math.max(...data.map((d) => d.total)));
    const yMax = ticks[ticks.length - 1];
    const innerW = width - PAD.left - PAD.right;
    const innerH = HEIGHT - PAD.top - PAD.bottom;
    const x = (i: number) =>
      PAD.left + (data.length <= 1 ? innerW : (i / (data.length - 1)) * innerW);
    const y = (v: number) => PAD.top + innerH - (v / yMax) * innerH;
    const line = data
      .map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.total).toFixed(1)}`)
      .join("");
    const area = `${line}L${x(data.length - 1)},${y(0)}L${x(0)},${y(0)}Z`;
    return { ticks, x, y, line, area, innerW };
  }, [data, width]);

  const last = data.length - 1;
  const xTicks = [0, Math.floor(last / 2), last].filter((v, i, a) => a.indexOf(v) === i);
  const h = hover ?? null;

  const pick = (clientX: number, rect: DOMRect) => {
    const rel = (clientX - rect.left - PAD.left) / geo.innerW;
    setHover(Math.min(last, Math.max(0, Math.round(rel * last))));
  };

  return (
    <div ref={box} className="relative">
      <svg
        width={width}
        height={HEIGHT}
        viewBox={`0 0 ${width} ${HEIGHT}`}
        role="img"
        aria-label={`Subscribers over the last ${data.length} days, from ${data[0]?.total ?? 0} to ${data[last]?.total ?? 0}. Use the arrow keys for daily values; the table below has every day.`}
        tabIndex={0}
        className="focus-visible:outline-ring block max-w-full focus-visible:outline-2 focus-visible:outline-offset-2"
        onPointerMove={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerLeave={() => setHover(null)}
        onFocus={() => setHover(last)}
        onBlur={() => setHover(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setHover((v) => Math.max(0, (v ?? last) - 1));
          if (e.key === "ArrowRight") setHover((v) => Math.min(last, (v ?? last) + 1));
        }}
      >
        {/* Recessive hairline grid and y-axis labels */}
        {geo.ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={geo.y(t)}
              y2={geo.y(t)}
              stroke={GRID}
              strokeWidth={1}
            />
            <text
              x={PAD.left - 8}
              y={geo.y(t)}
              dy="0.32em"
              textAnchor="end"
              fontSize={11}
              fill={INK_SECONDARY}
            >
              {fmtNum(t)}
            </text>
          </g>
        ))}
        {xTicks.map((i) => (
          <text
            key={i}
            x={geo.x(i)}
            y={HEIGHT - 8}
            textAnchor={i === 0 ? "start" : i === last ? "end" : "middle"}
            fontSize={11}
            fill={INK_SECONDARY}
          >
            {fmtDay(data[i].day)}
          </text>
        ))}

        <path d={geo.area} fill={SERIES} fillOpacity={0.1} />
        <path
          d={geo.line}
          fill="none"
          stroke={SERIES}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* End marker with a surface ring, and the one direct label: today's value */}
        <circle
          cx={geo.x(last)}
          cy={geo.y(data[last].total)}
          r={4}
          fill={SERIES}
          stroke={SURFACE}
          strokeWidth={2}
        />
        <text
          x={geo.x(last) + 8}
          y={geo.y(data[last].total)}
          dy="0.32em"
          fontSize={12}
          fontWeight={600}
          fill="#1c1917"
        >
          {fmtNum(data[last].total)}
        </text>

        {/* Crosshair, snapped to the nearest day */}
        {h !== null ? (
          <g pointerEvents="none">
            <line
              x1={geo.x(h)}
              x2={geo.x(h)}
              y1={PAD.top}
              y2={geo.y(0)}
              stroke={INK_SECONDARY}
              strokeWidth={1}
            />
            <circle
              cx={geo.x(h)}
              cy={geo.y(data[h].total)}
              r={4}
              fill={SERIES}
              stroke={SURFACE}
              strokeWidth={2}
            />
          </g>
        ) : null}
      </svg>

      {h !== null ? (
        <div
          role="status"
          className="bg-popover pointer-events-none absolute top-1 rounded-md border px-2.5 py-1.5 text-xs shadow-sm"
          style={{
            left: Math.min(Math.max(geo.x(h) + 10, 0), width - 150),
          }}
        >
          <p className="text-muted-foreground">{fmtDay(data[h].day)}</p>
          <p className="flex items-center gap-1.5">
            <span
              className="inline-block h-0.5 w-3 rounded"
              style={{ background: SERIES }}
              aria-hidden
            />
            <strong className="text-sm tabular-nums">{data[h].total.toLocaleString("en")}</strong>
            <span className="text-muted-foreground">subscribers</span>
          </p>
          {data[h].gained || data[h].lost ? (
            <p className="text-muted-foreground tabular-nums">
              +{data[h].gained} new · −{data[h].lost} left
            </p>
          ) : null}
        </div>
      ) : null}

      <details className="mt-2 text-sm">
        <summary className="text-muted-foreground cursor-pointer text-xs">Show as table</summary>
        <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border">
          <table className="w-full text-xs tabular-nums">
            <thead className="bg-background sticky top-0">
              <tr className="text-muted-foreground text-left">
                <th className="px-3 py-1.5 font-medium">Day</th>
                <th className="px-3 py-1.5 text-right font-medium">Subscribers</th>
                <th className="px-3 py-1.5 text-right font-medium">New</th>
                <th className="px-3 py-1.5 text-right font-medium">Left</th>
              </tr>
            </thead>
            <tbody>
              {[...data].reverse().map((d) => (
                <tr key={d.day} className="border-t">
                  <td className="px-3 py-1">{fmtDay(d.day)}</td>
                  <td className="px-3 py-1 text-right">{d.total.toLocaleString("en")}</td>
                  <td className="px-3 py-1 text-right">{d.gained}</td>
                  <td className="px-3 py-1 text-right">{d.lost}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
