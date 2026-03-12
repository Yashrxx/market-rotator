import { useState, useRef, useImperativeHandle, forwardRef, useMemo, useCallback } from "react";
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell, LabelList, Customized,
  Legend,
} from "recharts";

/* ------------------------------------------------------------------ */
/*  TYPES                                                              */
/* ------------------------------------------------------------------ */

interface HistoryPoint {
  "RS-Ratio": number;
  "RS-Momentum": number;
  fetched_at?: string;
}

interface DataPoint {
  symbol: string;
  name?: string;
  sector?: string;
  price?: number;
  change?: number;
  "RS-Ratio": number;
  "RS-Momentum": number;
  visible?: boolean;
}

interface RRGChartZoomableProps {
  data: DataPoint[];
  tailLength: number;
  history?: Record<string, HistoryPoint[]>;
  /** 0-based week offset from the slider (0 = latest) */
  weekOffset?: number;
}

export interface RRGChartRef {
  resetView: () => void;
}

/* ------------------------------------------------------------------ */
/*  QUADRANT COLOURS  (solid pastel, matching reference image)         */
/* ------------------------------------------------------------------ */

const Q = {
  leading:   { fill: "#d4edda", border: "#28a745", text: "#1e7e34", dot: "#28a745" },   // green
  weakening: { fill: "#fff3cd", border: "#ffc107", text: "#856404", dot: "#e6a800" },   // yellow
  lagging:   { fill: "#f8d7da", border: "#dc3545", text: "#bd2130", dot: "#dc3545" },   // red / pink
  improving: { fill: "#d6d8f8", border: "#6366f1", text: "#4338ca", dot: "#6366f1" },   // indigo / blue
};

/* Per-stock colour palette (distinct, matching reference style) */
const STOCK_COLORS = [
  "#2563eb", // blue
  "#16a34a", // green
  "#e11d48", // rose / pink
  "#1e3a5f", // dark navy
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#ea580c", // orange
  "#64748b", // slate
  "#d946ef", // fuchsia
  "#0d9488", // teal
  "#be123c", // crimson
  "#4f46e5", // indigo
  "#ca8a04", // yellow dark
  "#059669", // emerald
  "#7c3aed", // purple
  "#0284c7", // sky
  "#dc2626", // red
  "#65a30d", // lime
  "#c026d3", // magenta
];

const getQuadrant = (r: number, m: number) => {
  if (r >= 100 && m >= 100) return "leading";
  if (r >= 100 && m < 100) return "weakening";
  if (r < 100 && m < 100) return "lagging";
  return "improving";
};

const getQuadrantLabel = (r: number, m: number) => {
  if (r >= 100 && m >= 100) return "Leading";
  if (r >= 100 && m < 100) return "Weakening";
  if (r < 100 && m < 100) return "Lagging";
  return "Improving";
};

/* ------------------------------------------------------------------ */
/*  SYNTHETIC TAIL (when no real history exists)                       */
/* ------------------------------------------------------------------ */

function syntheticTail(
  rx: number, ry: number, len: number, sym: string,
): { x: number; y: number }[] {
  let h = 0;
  for (let i = 0; i < sym.length; i++) { h = ((h << 5) - h) + sym.charCodeAt(i); h |= 0; }
  const a0 = (Math.abs(h) % 360) * (Math.PI / 180);
  const r0 = 2.0 + (Math.abs(h) % 30) / 10;
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < len; i++) {
    const t = i / Math.max(len - 1, 1);
    const r = r0 * (1 - t * 0.85);
    const a = a0 + t * Math.PI * 0.6;
    pts.push({ x: rx + r * Math.cos(a), y: ry + r * Math.sin(a) });
  }
  return pts;
}

/* ------------------------------------------------------------------ */
/*  TOOLTIP                                                            */
/* ------------------------------------------------------------------ */

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const q = getQuadrant(d["RS-Ratio"], d["RS-Momentum"]);
  const qData = Q[q as keyof typeof Q];
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 shadow-xl text-xs">
      <p className="font-bold text-gray-900 dark:text-gray-100 text-sm mb-0.5">
        {d.symbol}{d.name ? ` — ${d.name}` : ""}
      </p>
      {d.sector && <p className="text-gray-500">{d.sector}</p>}
      {d.price != null && (
        <p className="text-gray-500">
          ₹{d.price.toFixed(2)}
          {d.change != null && (
            <span className={`ml-1.5 font-semibold ${d.change >= 0 ? "text-green-600" : "text-red-500"}`}>
              {d.change >= 0 ? "+" : ""}{d.change.toFixed(2)}%
            </span>
          )}
        </p>
      )}
      <div className="flex gap-4 mt-1">
        <p className="text-gray-500">RS-Ratio: <b className="text-gray-900 dark:text-gray-100">{d["RS-Ratio"].toFixed(2)}</b></p>
        <p className="text-gray-500">RS-Mom: <b className="text-gray-900 dark:text-gray-100">{d["RS-Momentum"].toFixed(2)}</b></p>
      </div>
      <p className="mt-1 font-semibold text-xs" style={{ color: qData.text }}>
        ● {getQuadrantLabel(d["RS-Ratio"], d["RS-Momentum"])}
      </p>
    </div>
  );
};

/* ================================================================== */
/*  MAIN COMPONENT                                                     */
/* ================================================================== */

export const RRGChartZoomable = forwardRef<RRGChartRef, RRGChartZoomableProps>(
  ({ data, tailLength, history = {}, weekOffset = 0 }, ref) => {

  const defaultDomain = { x: [94, 105] as number[], y: [97, 104.5] as number[] };
  const [domain, setDomain] = useState(defaultDomain);
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0 });
  const domainRef = useRef(domain);
  domainRef.current = domain;
  const containerRef = useRef<HTMLDivElement>(null);

  const visibleData = data.filter(d => d.visible !== false);

  /* Stable colour map: symbol → colour */
  const colorMap = useMemo(() => {
    const m = new Map<string, string>();
    data.forEach((s, i) => m.set(s.symbol, STOCK_COLORS[i % STOCK_COLORS.length]));
    return m;
  }, [data]);

  /* ---- tail segments ---- */
  const tailSegments = useMemo(() => {
    return visibleData.map(stock => {
      const hist = history[stock.symbol];
      let pts: { x: number; y: number }[];
      if (hist && hist.length >= 2) {
        // tailLength = how many historical points to show in the trail
        pts = hist.slice(-tailLength).map(p => ({ x: p["RS-Ratio"], y: p["RS-Momentum"] }));
      } else {
        pts = syntheticTail(stock["RS-Ratio"], stock["RS-Momentum"], tailLength, stock.symbol);
      }
      // Always end at the current position
      pts.push({ x: stock["RS-Ratio"], y: stock["RS-Momentum"] });
      return {
        symbol: stock.symbol,
        points: pts,
        color: colorMap.get(stock.symbol) || "#666",
      };
    });
  }, [visibleData, history, tailLength, colorMap]);

  /* ---- view helpers ---- */
  const resetView = useCallback(() => setDomain(defaultDomain), []);
  useImperativeHandle(ref, () => ({ resetView }));

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const f = e.deltaY > 0 ? 1.08 : 0.93;
    setDomain(p => {
      const cx = (p.x[0] + p.x[1]) / 2;
      const cy = (p.y[0] + p.y[1]) / 2;
      const hw = ((p.x[1] - p.x[0]) / 2) * f;
      const hh = ((p.y[1] - p.y[0]) / 2) * f;
      return { x: [cx - hw, cx + hw], y: [cy - hh, cy + hh] };
    });
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsPanning(true);
    panStart.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning) return;
    const el = containerRef.current;
    if (!el) return;
    const d = domainRef.current;
    const xR = d.x[1] - d.x[0];
    const yR = d.y[1] - d.y[0];
    const dx = -(e.clientX - panStart.current.x) / el.offsetWidth * xR;
    const dy = (e.clientY - panStart.current.y) / el.offsetHeight * yR;
    panStart.current = { x: e.clientX, y: e.clientY };
    setDomain(p => ({ x: [p.x[0] + dx, p.x[1] + dx], y: [p.y[0] + dy, p.y[1] + dy] }));
  }, [isPanning]);

  const stopPan = useCallback(() => setIsPanning(false), []);

  /* ---- custom SVG layer: quadrant fills + tails + labels ---- */
  const renderCustomLayer = useCallback((props: any) => {
    const { xAxisMap, yAxisMap } = props;
    if (!xAxisMap || !yAxisMap) return null;
    const xA = Object.values(xAxisMap)[0] as any;
    const yA = Object.values(yAxisMap)[0] as any;
    if (!xA?.scale || !yA?.scale) return null;
    const sx = xA.scale;
    const sy = yA.scale;

    const cx = sx(100) as number;
    const cy = sy(100) as number;
    const pxL = sx(domain.x[0]) as number;
    const pxR = sx(domain.x[1]) as number;
    const pyT = sy(domain.y[1]) as number;
    const pyB = sy(domain.y[0]) as number;

    // clamp so rects don't go negative when 100 is outside viewport
    const clampW = (w: number) => Math.max(0, w);
    const clampH = (h: number) => Math.max(0, h);

    return (
      <g>
        {/* ---- solid pastel quadrant fills ---- */}
        {/* Leading: top-right (x≥100, y≥100) */}
        <rect x={Math.max(cx, pxL)} y={pyT} width={clampW(pxR - Math.max(cx, pxL))} height={clampH(Math.min(cy, pyB) - pyT)} fill={Q.leading.fill} opacity={0.55} />
        {/* Weakening: bottom-right (x≥100, y<100) */}
        <rect x={Math.max(cx, pxL)} y={Math.max(cy, pyT)} width={clampW(pxR - Math.max(cx, pxL))} height={clampH(pyB - Math.max(cy, pyT))} fill={Q.weakening.fill} opacity={0.45} />
        {/* Lagging: bottom-left (x<100, y<100) */}
        <rect x={pxL} y={Math.max(cy, pyT)} width={clampW(Math.min(cx, pxR) - pxL)} height={clampH(pyB - Math.max(cy, pyT))} fill={Q.lagging.fill} opacity={0.45} />
        {/* Improving: top-left (x<100, y≥100) */}
        <rect x={pxL} y={pyT} width={clampW(Math.min(cx, pxR) - pxL)} height={clampH(Math.min(cy, pyB) - pyT)} fill={Q.improving.fill} opacity={0.45} />

        {/* ---- quadrant corner labels ---- */}
        <text x={pxR - 8} y={pyT + 20} textAnchor="end" fill={Q.leading.text} fontSize={15} fontWeight={800} opacity={0.7}>Leading</text>
        <text x={pxR - 8} y={pyB - 8} textAnchor="end" fill={Q.weakening.text} fontSize={15} fontWeight={800} opacity={0.7}>Weakening</text>
        <text x={pxL + 8} y={pyB - 8} textAnchor="start" fill={Q.lagging.text} fontSize={15} fontWeight={800} opacity={0.7}>Lagging</text>
        <text x={pxL + 8} y={pyT + 20} textAnchor="start" fill={Q.improving.text} fontSize={15} fontWeight={800} opacity={0.7}>Improving</text>

        {/* ---- tails: connected lines with dots at each data point ---- */}
        {tailSegments.map(seg => {
          const px = seg.points.map(p => ({ x: sx(p.x) as number, y: sy(p.y) as number }));
          if (px.length < 2) return null;
          const pathD = px.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
          return (
            <g key={`t-${seg.symbol}`}>
              {/* trail line */}
              <path d={pathD} fill="none" stroke={seg.color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />
              {/* dots at each historical point (smaller for older, bigger for recent) */}
              {px.map((p, i) => {
                const isHead = i === px.length - 1;
                const age = px.length > 1 ? i / (px.length - 1) : 1;
                return (
                  <circle
                    key={i}
                    cx={p.x} cy={p.y}
                    r={isHead ? 5 : 2.5 + age * 1.5}
                    fill={isHead ? seg.color : seg.color}
                    stroke={isHead ? "#fff" : "none"}
                    strokeWidth={isHead ? 2 : 0}
                    opacity={isHead ? 1 : 0.4 + age * 0.5}
                  />
                );
              })}
              {/* label near the head dot */}
              {px.length > 0 && (
                <text
                  x={px[px.length - 1].x}
                  y={px[px.length - 1].y - 10}
                  textAnchor="middle"
                  fill={seg.color}
                  fontSize={11}
                  fontWeight={700}
                  style={{ pointerEvents: "none" }}
                >
                  {seg.symbol}
                </text>
              )}
            </g>
          );
        })}
      </g>
    );
  }, [domain, tailSegments]);

  /* ---- legend entries for the bottom ---- */
  const legendPayload = useMemo(() =>
    visibleData.map(s => ({
      value: s.symbol,
      type: "line" as const,
      color: colorMap.get(s.symbol) || "#666",
      id: s.symbol,
    }))
  , [visibleData, colorMap]);

  return (
    <div
      className="w-full h-full rounded-lg border border-gray-300 dark:border-gray-600 relative select-none overflow-hidden"
      style={{ background: "#fff" }}
      ref={containerRef}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={stopPan}
      onMouseLeave={stopPan}
      tabIndex={0}
      role="img"
      aria-label="Relative Rotation Graph"
      onKeyDown={(e) => { if (e.key === "Escape") resetView(); }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 16, right: 20, bottom: 52, left: 52 }}>
          {/* Grid on top of quadrant fills — subtle */}
          <CartesianGrid strokeDasharray="3 3" stroke="#d1d5db" opacity={0.5} />

          <XAxis
            type="number" dataKey="RS-Ratio" domain={domain.x}
            allowDataOverflow
            tickFormatter={v => v.toFixed(1)}
            label={{ value: "JdK RS-Ratio", position: "insideBottom", offset: -10, fill: "#374151", fontSize: 13, fontWeight: 600 }}
            stroke="#9ca3af" tick={{ fill: "#6b7280", fontSize: 11 }}
            tickLine={{ stroke: "#d1d5db" }}
          />
          <YAxis
            type="number" dataKey="RS-Momentum" domain={domain.y}
            allowDataOverflow
            tickFormatter={v => v.toFixed(1)}
            label={{ value: "JdK RS-Momentum", angle: -90, position: "insideLeft", offset: -10, fill: "#374151", fontSize: 13, fontWeight: 600 }}
            stroke="#9ca3af" tick={{ fill: "#6b7280", fontSize: 11 }}
            tickLine={{ stroke: "#d1d5db" }}
          />

          {/* Crosshair lines at 100 */}
          <ReferenceLine x={100} stroke="#6b7280" strokeWidth={1.5} strokeDasharray="0" opacity={0.6} />
          <ReferenceLine y={100} stroke="#6b7280" strokeWidth={1.5} strokeDasharray="0" opacity={0.6} />

          {/* Custom SVG layer */}
          <Customized component={renderCustomLayer} />

          <Tooltip content={<CustomTooltip />} cursor={false} />

          {/* Invisible scatter for hover/tooltip only — dots are drawn in custom layer */}
          <Scatter data={visibleData} animationDuration={400} animationEasing="ease-out">
            {visibleData.map((e, i) => (
              <Cell key={i} fill="transparent" r={8} />
            ))}
          </Scatter>

          {/* Bottom legend */}
          <Legend
            payload={legendPayload}
            verticalAlign="bottom"
            align="center"
            wrapperStyle={{ paddingTop: 10, fontSize: 12, fontWeight: 600 }}
            iconType="circle"
            iconSize={8}
          />
        </ScatterChart>
      </ResponsiveContainer>

      {/* Pan/zoom hint */}
      <div className="absolute bottom-1 right-2 text-[10px] text-gray-400 pointer-events-none select-none">
        Scroll to zoom · Drag to pan · Esc to reset
      </div>
    </div>
  );
});
