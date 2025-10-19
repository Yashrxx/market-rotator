import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from "recharts";

interface DataPoint {
  symbol: string;
  "RS-Ratio": number;
  "RS-Momentum": number;
}

interface RRGChartProps {
  data: DataPoint[];
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

export const RRGChart = ({ data }: RRGChartProps) => {
  return (
    <div className="w-full h-full bg-chart-bg rounded-lg border border-border p-6">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 20, right: 20, bottom: 60, left: 60 }}>
          {/* Quadrant backgrounds */}
          <defs>
            <pattern id="leading" patternUnits="userSpaceOnUse" width="100%" height="100%">
              <rect width="100%" height="100%" fill="hsl(var(--quadrant-leading))" opacity="0.1" />
            </pattern>
            <pattern id="weakening" patternUnits="userSpaceOnUse" width="100%" height="100%">
              <rect width="100%" height="100%" fill="hsl(var(--quadrant-weakening))" opacity="0.1" />
            </pattern>
            <pattern id="lagging" patternUnits="userSpaceOnUse" width="100%" height="100%">
              <rect width="100%" height="100%" fill="hsl(var(--quadrant-lagging))" opacity="0.1" />
            </pattern>
            <pattern id="improving" patternUnits="userSpaceOnUse" width="100%" height="100%">
              <rect width="100%" height="100%" fill="hsl(var(--quadrant-improving))" opacity="0.1" />
            </pattern>
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--chart-grid))" opacity={0.3} />
          
          <XAxis
            type="number"
            dataKey="RS-Ratio"
            domain={[90, 115]}
            label={{ value: "RS-Ratio", position: "insideBottom", offset: -10, fill: "hsl(var(--chart-axis))" }}
            stroke="hsl(var(--chart-axis))"
            tick={{ fill: "hsl(var(--chart-axis))" }}
          />
          
          <YAxis
            type="number"
            dataKey="RS-Momentum"
            domain={[95, 110]}
            label={{ value: "RS-Momentum", angle: -90, position: "insideLeft", fill: "hsl(var(--chart-axis))" }}
            stroke="hsl(var(--chart-axis))"
            tick={{ fill: "hsl(var(--chart-axis))" }}
          />

          {/* Reference lines at 100 */}
          <ReferenceLine x={100} stroke="hsl(var(--foreground))" strokeWidth={2} opacity={0.5} />
          <ReferenceLine y={100} stroke="hsl(var(--foreground))" strokeWidth={2} opacity={0.5} />

          <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: "3 3" }} />

          <Scatter
            data={data}
            fill="hsl(var(--primary))"
            animationDuration={800}
            animationEasing="ease-out"
          >
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={getQuadrantColor(entry["RS-Ratio"], entry["RS-Momentum"])}
                r={8}
              />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>

      {/* Quadrant Labels */}
      <div className="absolute top-8 right-8 bg-card/80 backdrop-blur-sm border border-border rounded-lg p-3 text-xs">
        <div className="flex items-center gap-2 mb-1.5">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "hsl(var(--quadrant-leading))" }} />
          <span className="text-foreground">Leading</span>
        </div>
        <div className="flex items-center gap-2 mb-1.5">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "hsl(var(--quadrant-weakening))" }} />
          <span className="text-foreground">Weakening</span>
        </div>
        <div className="flex items-center gap-2 mb-1.5">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "hsl(var(--quadrant-lagging))" }} />
          <span className="text-foreground">Lagging</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "hsl(var(--quadrant-improving))" }} />
          <span className="text-foreground">Improving</span>
        </div>
      </div>
    </div>
  );
};
