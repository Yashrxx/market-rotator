import { useState, useRef, useImperativeHandle, forwardRef } from "react";
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea, Cell } from "recharts";

interface DataPoint {
  symbol: string;
  "RS-Ratio": number;
  "RS-Momentum": number;
  visible?: boolean;
}

interface RRGChartZoomableProps {
  data: DataPoint[];
  tailLength: number;
}

export interface RRGChartRef {
  resetView: () => void;
}

const getQuadrantColor = (rsRatio: number, rsMomentum: number): string => {
  if (rsRatio >= 100 && rsMomentum >= 100) return "hsl(var(--quadrant-leading))";
  if (rsRatio >= 100 && rsMomentum < 100) return "hsl(var(--quadrant-weakening))";
  if (rsRatio < 100 && rsMomentum < 100) return "hsl(var(--quadrant-lagging))";
  return "hsl(var(--quadrant-improving))";
};

const getQuadrantLabel = (rsRatio: number, rsMomentum: number): string => {
  if (rsRatio >= 100 && rsMomentum >= 100) return "Leading";
  if (rsRatio >= 100 && rsMomentum < 100) return "Weakening";
  if (rsRatio < 100 && rsMomentum < 100) return "Lagging";
  return "Improving";
};

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
        <p className="font-semibold text-foreground mb-1">{data.symbol}</p>
        <p className="text-sm text-muted-foreground">
          RS-Ratio: <span className="text-foreground font-medium">{data["RS-Ratio"].toFixed(2)}</span>
        </p>
        <p className="text-sm text-muted-foreground">
          RS-Momentum: <span className="text-foreground font-medium">{data["RS-Momentum"].toFixed(2)}</span>
        </p>
        <p className="text-sm mt-1" style={{ color: getQuadrantColor(data["RS-Ratio"], data["RS-Momentum"]) }}>
          {getQuadrantLabel(data["RS-Ratio"], data["RS-Momentum"])}
        </p>
      </div>
    );
  }
  return null;
};

export const RRGChartZoomable = forwardRef<RRGChartRef, RRGChartZoomableProps>(({ data, tailLength }, ref) => {
  const defaultDomain = { x: [90, 110], y: [90, 110] };
  const [domain, setDomain] = useState(defaultDomain);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const chartRef = useRef<HTMLDivElement>(null);

  const visibleData = data.filter(item => item.visible !== false);

  const resetView = () => {
    setDomain(defaultDomain);
  };

  useImperativeHandle(ref, () => ({
    resetView,
  }));

  const handleWheel = (e: React.WheelEvent) => {
    // Only zoom if Ctrl (Windows/Linux) or Cmd (Mac) key is pressed
    if (!e.ctrlKey && !e.metaKey) {
      return;
    }

    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;

    setDomain(prev => {
      const xRange = prev.x[1] - prev.x[0];
      const yRange = prev.y[1] - prev.y[0];

      const newXRange = xRange * zoomFactor;
      const newYRange = yRange * zoomFactor;

      const xCenter = 100;
      const yCenter = 100;

      return {
        x: [xCenter - newXRange / 2, xCenter + newXRange / 2],
        y: [yCenter - newYRange / 2, yCenter + newYRange / 2],
      };
    });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsPanning(true);
    setPanStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning) return;

    const deltaX = e.clientX - panStart.x;
    const deltaY = e.clientY - panStart.y;

    const chartElement = chartRef.current;
    if (!chartElement) return;

    const xRange = domain.x[1] - domain.x[0];
    const yRange = domain.y[1] - domain.y[0];

    const xShift = -(deltaX / chartElement.offsetWidth) * xRange;
    const yShift = (deltaY / chartElement.offsetHeight) * yRange;

    setDomain(prev => ({
      x: [prev.x[0] + xShift, prev.x[1] + xShift],
      y: [prev.y[0] + yShift, prev.y[1] + yShift],
    }));

    setPanStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  const handleMouseLeave = () => {
    setIsPanning(false);
  };

  return (
    <div
      className="w-full h-full bg-chart-bg rounded-lg border border-border p-6 relative"
      ref={chartRef}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      style={{ cursor: isPanning ? "grabbing" : "grab" }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 20, right: 20, bottom: 60, left: 60 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--chart-grid))" opacity={0.3} />

          <XAxis
            type="number"
            dataKey="RS-Ratio"
            domain={domain.x}
            tickFormatter={(value) => value.toFixed(2)} // <-- enforce 2 decimal places
            label={{ value: "RS-Ratio", position: "insideBottom", offset: -10, fill: "hsl(var(--chart-axis))" }}
            stroke="hsl(var(--chart-axis))"
            tick={{ fill: "hsl(var(--chart-axis))" }}
          />

          <YAxis
            type="number"
            dataKey="RS-Momentum"
            domain={domain.y}
            tickFormatter={(value) => value.toFixed(2)}
            label={{ value: "RS-Momentum", angle: -90, position: "insideLeft", offset: -20, fill: "hsl(var(--chart-axis))" }}
            stroke="hsl(var(--chart-axis))"
            tick={{ fill: "hsl(var(--chart-axis))" }}
          />


          <ReferenceLine x={100} stroke="hsl(var(--foreground))" strokeWidth={2} opacity={0.5} />
          <ReferenceLine y={100} stroke="hsl(var(--foreground))" strokeWidth={2} opacity={0.5} />

          <ReferenceArea x1={100} y1={100} x2={domain.x[1]} y2={domain.y[1]} fill="hsl(var(--quadrant-leading) / 0.15)" />
          <ReferenceArea x1={100} y1={domain.y[0]} x2={domain.x[1]} y2={100} fill="hsl(var(--quadrant-weakening) / 0.15)" />
          <ReferenceArea x1={domain.x[0]} y1={domain.y[0]} x2={100} y2={100} fill="hsl(var(--quadrant-lagging) / 0.15)" />
          <ReferenceArea x1={domain.x[0]} y1={100} x2={100} y2={domain.y[1]} fill="hsl(var(--quadrant-improving) / 0.15)" />


          <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: "3 3" }} />

          <Scatter
            data={visibleData}
            fill="hsl(var(--primary))"
            animationDuration={800}
            animationEasing="ease-out"
          >
            {visibleData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={getQuadrantColor(entry["RS-Ratio"], entry["RS-Momentum"])}
                r={8}
              />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>

      {/* Fixed Quadrant Background Titles */}
      <div className="absolute top-[15%] right-[15%] text-2xl font-bold opacity-20 pointer-events-none" style={{ color: "hsl(var(--quadrant-leading))" }}>
        Leading
      </div>
      <div className="absolute bottom-[25%] right-[15%] text-2xl font-bold opacity-20 pointer-events-none" style={{ color: "hsl(var(--quadrant-weakening))" }}>
        Weakening
      </div>
      <div className="absolute bottom-[25%] left-[20%] text-2xl font-bold opacity-20 pointer-events-none" style={{ color: "hsl(var(--quadrant-lagging))" }}>
        Lagging
      </div>
      <div className="absolute top-[15%] left-[20%] text-2xl font-bold opacity-20 pointer-events-none" style={{ color: "hsl(var(--quadrant-improving))" }}>
        Improving
      </div>
    </div>
  );
});
