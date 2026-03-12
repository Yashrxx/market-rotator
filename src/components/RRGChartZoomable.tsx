import { useState, useRef, useImperativeHandle, forwardRef, useMemo } from "react";
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell, LabelList, Customized,
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
}

export interface RRGChartRef {
  resetView: () => void;
}

/* ------------------------------------------------------------------ */
/*  COLOUR HELPERS                                                     */
/* ------------------------------------------------------------------ */

const Q = {
  leading:    "#22c55e",
  weakening:  "#eab308",
  lagging:    "#ef4444",
  improving:  "#3b82f6",
};

const getColor = (r: number, m: number) => {
  if (r >= 100 && m >= 100) return Q.leading;
  if (r >= 100 && m <  100) return Q.weakening;
  if (r <  100 && m <  100) return Q.lagging;
  return Q.improving;
};

const getLabel = (r: number, m: number) => {
  if (r >= 100 && m >= 100) return "Leading";
  if (r >= 100 && m <  100) return "Weakening";
  if (r <  100 && m <  100) return "Lagging";
  return "Improving";
};

/* ------------------------------------------------------------------ */
/*  SYNTHETIC TAIL GENERATOR                                           */
/* ------------------------------------------------------------------ */

function syntheticTail(
  rx: number, ry: number, len: number, sym: string,
): { x: number; y: number }[] {
  let h = 0;
  for (let i = 0; i < sym.length; i++) { h = ((h << 5) - h) + sym.charCodeAt(i); h |= 0; }
  const a0 = (Math.abs(h) % 360) * (Math.PI / 180);
  const r0 = 1.5 + (Math.abs(h) % 20) / 10;
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < len; i++) {
    const t = i / len;
    const r = r0 * (1 - t);
    const a = a0 + t * Math.PI * 0.7;
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
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold text-foreground text-sm mb-0.5">
        {d.symbol}{d.name ? ` — ${d.name}` : ""}
      </p>
      {d.sector && <p className="text-muted-foreground">{d.sector}</p>}
      {d.price != null && (
        <p className="text-muted-foreground">
          ₹{d.price.toFixed(2)}
          {d.change != null && (
            <span className={`ml-1.5 ${d.change >= 0 ? "text-green-500" : "text-red-500"}`}>
              {d.change >= 0 ? "+" : ""}{d.change.toFixed(2)}%
            </span>
          )}
        </p>
      )}
      <p className="text-muted-foreground">RS-Ratio: <b className="text-foreground">{d["RS-Ratio"].toFixed(2)}</b></p>
      <p className="text-muted-foreground">RS-Mom: <b className="text-foreground">{d["RS-Momentum"].toFixed(2)}</b></p>
      <p className="mt-0.5 font-medium" style={{ color: getColor(d["RS-Ratio"], d["RS-Momentum"]) }}>
        {getLabel(d["RS-Ratio"], d["RS-Momentum"])}
      </p>
    </div>
  );
};

/* ================================================================== */
/*  MAIN COMPONENT                                                     */
/* ================================================================== */

export const RRGChartZoomable = forwardRef<RRGChartRef, RRGChartZoomableProps>(
  ({ data, tailLength, history = {} }, ref) => {

  const defaultDomain = { x: [92, 108] as number[], y: [96, 104] as number[] };
  const [domain, setDomain] = useState(defaultDomain);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const chartRef = useRef<HTMLDivElement>(null);

  const visibleData = data.filter(d => d.visible !== false);

  /* ---- tail segments ---- */
  const tailSegments = useMemo(() => {
    return visibleData.map(stock => {
      const hist = history[stock.symbol];
      let pts: { x: number; y: number }[];
      if (hist && hist.length >= 2) {
        pts = hist.slice(-tailLength).map(p => ({ x: p["RS-Ratio"], y: p["RS-Momentum"] }));
      } else {
        pts = syntheticTail(stock["RS-Ratio"], stock["RS-Momentum"], tailLength, stock.symbol);
      }
      pts.push({ x: stock["RS-Ratio"], y: stock["RS-Momentum"] });
      return { symbol: stock.symbol, points: pts, color: getColor(stock["RS-Ratio"], stock["RS-Momentum"]) };
    });
  }, [visibleData, history, tailLength]);

  /* ---- view helpers ---- */
  const resetView = () => setDomain(defaultDomain);
  useImperativeHandle(ref, () => ({ resetView }));

  const handleWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const f = e.deltaY > 0 ? 1.1 : 0.9;
    setDomain(p => {
      const cx = (p.x[0] + p.x[1]) / 2;
      const cy = (p.y[0] + p.y[1]) / 2;
      const hw = ((p.x[1] - p.x[0]) / 2) * f;
      const hh = ((p.y[1] - p.y[0]) / 2) * f;
      return { x: [cx - hw, cx + hw], y: [cy - hh, cy + hh] };
    });
  };

  const handleMouseDown = (e: React.MouseEvent) => { setIsPanning(true); setPanStart({ x: e.clientX, y: e.clientY }); };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning) return;
    const el = chartRef.current;
    if (!el) return;
    const xR = domain.x[1] - domain.x[0];
    const yR = domain.y[1] - domain.y[0];
    const dx = -(e.clientX - panStart.x) / el.offsetWidth * xR;
    const dy = (e.clientY - panStart.y) / el.offsetHeight * yR;
    setDomain(p => ({ x: [p.x[0] + dx, p.x[1] + dx], y: [p.y[0] + dy, p.y[1] + dy] }));
    setPanStart({ x: e.clientX, y: e.clientY });
  };
  const handleMouseUp = () => setIsPanning(false);
  const handleMouseLeave = () => setIsPanning(false);

  /* ---- custom SVG layer: quadrant fills + tails + labels ---- */
  const renderCustomLayer = (props: any) => {
    const { xAxisMap, yAxisMap } = props;
    if (!xAxisMap || !yAxisMap) return null;
    const xA = Object.values(xAxisMap)[0] as any;
    const yA = Object.values(yAxisMap)[0] as any;
    if (!xA?.scale || !yA?.scale) return null;
    const sx = xA.scale;
    const sy = yA.scale;

    // Pixel position of 100,100 (the crosshair)
    const cx = sx(100) as number;
    const cy = sy(100) as number;

    // Chart plot area bounds (from axis range → pixels)
    const pxL = sx(domain.x[0]) as number;
    const pxR = sx(domain.x[1]) as number;
    const pyT = sy(domain.y[1]) as number;   // Y is inverted in SVG
    const pyB = sy(domain.y[0]) as number;

    return (
      <g>
        {/* ---- quadrant fills anchored at 100,100 ---- */}
        {/* Leading: x≥100 y≥100 → top-right */}
        <rect x={cx} y={pyT} width={pxR - cx} height={cy - pyT} fill={Q.leading}  opacity={0.08} />
        {/* Weakening: x≥100 y<100 → bottom-right */}
        <rect x={cx} y={cy}  width={pxR - cx} height={pyB - cy} fill={Q.weakening} opacity={0.08} />
        {/* Lagging: x<100 y<100 → bottom-left */}
        <rect x={pxL} y={cy} width={cx - pxL} height={pyB - cy} fill={Q.lagging}  opacity={0.08} />
        {/* Improving: x<100 y≥100 → top-left */}
        <rect x={pxL} y={pyT} width={cx - pxL} height={cy - pyT} fill={Q.improving} opacity={0.08} />

        {/* ---- quadrant labels (always relative to 100,100) ---- */}
        <text x={cx + 8}      y={pyT + 22}  fill={Q.leading}   fontSize={16} fontWeight={700} opacity={0.25}>Leading</text>
        <text x={cx + 8}      y={pyB - 10}  fill={Q.weakening} fontSize={16} fontWeight={700} opacity={0.25}>Weakening</text>
        <text x={pxL + 8}     y={pyB - 10}  fill={Q.lagging}   fontSize={16} fontWeight={700} opacity={0.25}>Lagging</text>
        <text x={pxL + 8}     y={pyT + 22}  fill={Q.improving} fontSize={16} fontWeight={700} opacity={0.25}>Improving</text>

        {/* ---- tails ---- */}
        {tailSegments.map(seg => {
          const px = seg.points.map(p => ({ x: sx(p.x) as number, y: sy(p.y) as number }));
          const d = px.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
          return (
            <g key={`t-${seg.symbol}`}>
              <path d={d} fill="none" stroke={seg.color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" opacity={0.6} />
              {px.slice(0, -1).map((p, i) => {
                const t = px.length > 1 ? i / (px.length - 1) : 1;
                return (
                  <circle key={i} cx={p.x} cy={p.y} r={1.5 + t * 2} fill={seg.color} opacity={0.15 + t * 0.5} />
                );
              })}
            </g>
          );
        })}
      </g>
    );
  };

  return (
    <div
      className="w-full h-full bg-chart-bg rounded-lg border border-border p-4 relative select-none"
      ref={chartRef}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      style={{ cursor: isPanning ? "grabbing" : "grab" }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 14, right: 14, bottom: 46, left: 46 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--chart-grid))" opacity={0.25} />

          <XAxis
            type="number" dataKey="RS-Ratio" domain={domain.x}
            allowDataOverflow
            tickFormatter={v => v.toFixed(1)}
            label={{ value: "RS-Ratio →", position: "insideBottom", offset: -8, fill: "hsl(var(--chart-axis))", fontSize: 12 }}
            stroke="hsl(var(--chart-axis))" tick={{ fill: "hsl(var(--chart-axis))", fontSize: 11 }}
          />
          <YAxis
            type="number" dataKey="RS-Momentum" domain={domain.y}
            allowDataOverflow
            tickFormatter={v => v.toFixed(1)}
            label={{ value: "RS-Momentum →", angle: -90, position: "insideLeft", offset: -14, fill: "hsl(var(--chart-axis))", fontSize: 12 }}
            stroke="hsl(var(--chart-axis))" tick={{ fill: "hsl(var(--chart-axis))", fontSize: 11 }}
          />

          <ReferenceLine x={100} stroke="hsl(var(--foreground))" strokeWidth={1.5} opacity={0.4} />
          <ReferenceLine y={100} stroke="hsl(var(--foreground))" strokeWidth={1.5} opacity={0.4} />

          {/* Custom SVG: quadrant fills + tails (always in sync with axes) */}
          <Customized component={renderCustomLayer} />

          <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: "3 3" }} />

          <Scatter data={visibleData} animationDuration={600} animationEasing="ease-out">
            {visibleData.map((e, i) => (
              <Cell key={i} fill={getColor(e["RS-Ratio"], e["RS-Momentum"])} r={6} />
            ))}
            <LabelList
              dataKey="symbol" position="top" offset={10}
              style={{ fontSize: 10, fontWeight: 600, fill: "hsl(var(--foreground))", pointerEvents: "none" }}
            />
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
});
