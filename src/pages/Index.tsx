import { useState, useRef } from "react";
import { ControlBar } from "@/components/ControlBar";
import { RRGChartZoomable, RRGChartRef } from "@/components/RRGChartZoomable";
import { StockTable } from "@/components/StockTable";
import { toast } from "sonner";

interface StockData {
  symbol: string;
  name: string;
  sector: string;
  industry: string;
  price: number;
  change: number;
  "RS-Ratio": number;
  "RS-Momentum": number;
  visible: boolean;
}

// Placeholder data structure with extended information
const initialData: StockData[] = [
  { symbol: "$INDU", name: "Dow Jones", sector: "Index", industry: "Broad Market", price: 35420.50, change: 0.45, "RS-Ratio": 97.5, "RS-Momentum": 100.8, visible: true },
  { symbol: "$COMPQ", name: "NASDAQ", sector: "Index", industry: "Technology", price: 14138.23, change: 1.23, "RS-Ratio": 102.3, "RS-Momentum": 100.2, visible: true },
  { symbol: "$CDNX", name: "TSX Venture", sector: "Index", industry: "Small Cap", price: 892.45, change: 2.15, "RS-Ratio": 108.5, "RS-Momentum": 102.1, visible: true },
  { symbol: "$XAU", name: "Gold/Silver", sector: "Commodity", industry: "Precious Metals", price: 124.32, change: -0.87, "RS-Ratio": 95.2, "RS-Momentum": 98.5, visible: true },
  { symbol: "$HUI", name: "Gold Bugs", sector: "Commodity", industry: "Mining", price: 256.78, change: -1.24, "RS-Ratio": 93.8, "RS-Momentum": 96.2, visible: true },
  { symbol: "$SPX", name: "S&P 500", sector: "Index", industry: "Broad Market", price: 4536.89, change: 0.67, "RS-Ratio": 100.0, "RS-Momentum": 100.0, visible: true },
  { symbol: "$NDX", name: "NASDAQ 100", sector: "Index", industry: "Large Cap Tech", price: 15423.12, change: 1.45, "RS-Ratio": 104.2, "RS-Momentum": 101.5, visible: true },
  { symbol: "$RUT", name: "Russell 2000", sector: "Index", industry: "Small Cap", price: 1987.65, change: -0.34, "RS-Ratio": 98.7, "RS-Momentum": 99.3, visible: true },
];

const Index = () => {
  const [timeline, setTimeline] = useState("Weekly");
  const [benchmark, setBenchmark] = useState("$SPX");
  const [data, setData] = useState<StockData[]>(initialData);
  const [isLoading, setIsLoading] = useState(false);
  const [tailLength, setTailLength] = useState(10);
  const chartRef = useRef<RRGChartRef>(null);

  const handleFetchData = () => {
    setIsLoading(true);
    toast.info("Fetching latest market data...");
    
    // Simulate API call
    setTimeout(() => {
      // Generate slightly randomized data to simulate updates
      const newData = data.map(item => ({
        ...item,
        "RS-Ratio": item["RS-Ratio"] + (Math.random() - 0.5) * 2,
        "RS-Momentum": item["RS-Momentum"] + (Math.random() - 0.5) * 2,
        change: item.change + (Math.random() - 0.5) * 0.5,
        price: item.price + (Math.random() - 0.5) * 10,
      }));
      
      setData(newData);
      setIsLoading(false);
      toast.success("Data updated successfully!");
    }, 1500);
  };

  const handleVisibilityToggle = (symbol: string) => {
    setData(prev => prev.map(item => 
      item.symbol === symbol ? { ...item, visible: !item.visible } : item
    ));
  };

  const handleCenterGraph = () => {
    chartRef.current?.resetView();
    toast.success("Graph centered");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border bg-card">
        <div className="px-6 py-4">
          <h1 className="text-2xl font-bold text-foreground">
            Relative Rotation Graph
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Visualize relative strength and momentum across market indices
          </p>
        </div>
      </header>

      <ControlBar
        timeline={timeline}
        onTimelineChange={setTimeline}
        benchmark={benchmark}
        onFetchData={handleFetchData}
        isLoading={isLoading}
        tailLength={tailLength}
        onTailLengthChange={setTailLength}
        onCenterGraph={handleCenterGraph}
      />

      <main className="flex-1 p-6 space-y-6">
        <div className="h-[500px] relative">
          <RRGChartZoomable ref={chartRef} data={data} tailLength={tailLength} />
        </div>

        <StockTable data={data} onVisibilityToggle={handleVisibilityToggle} />
      </main>

      <footer className="border-t border-border bg-card py-3 px-6">
        <p className="text-xs text-muted-foreground text-center">
          Data updates: {timeline} | Backend integration ready for live data feeds
        </p>
      </footer>
    </div>
  );
};

export default Index;
