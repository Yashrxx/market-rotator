import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { ControlBar } from "@/components/ControlBar";
import { RRGChartZoomable, RRGChartRef } from "@/components/RRGChartZoomable";
import { TimelineSlider } from "@/components/TimelineSlider";
import { StockTable } from "@/components/StockTable";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

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

interface HistoryPoint {
  "RS-Ratio": number;
  "RS-Momentum": number;
  fetched_at: string;
}

// History map: symbol → array of historical RS points (oldest first)
type HistoryMap = Record<string, HistoryPoint[]>;

// Indian NSE stock placeholders – spread across all 4 quadrants
const initialData: StockData[] = [
  { symbol: "SBIN",       name: "SBI",           sector: "Banking",    industry: "PSU Bank",        price: 850,   change:  0.45, "RS-Ratio": 99.2,  "RS-Momentum": 100.8, visible: true },
  { symbol: "RELIANCE",   name: "Reliance",      sector: "Energy",     industry: "Oil & Gas",       price: 1290,  change: -0.32, "RS-Ratio": 101.8, "RS-Momentum": 99.4,  visible: true },
  { symbol: "TCS",        name: "TCS",           sector: "IT",         industry: "Software",        price: 4100,  change:  1.10, "RS-Ratio": 103.5, "RS-Momentum": 101.6, visible: true },
  { symbol: "INFY",       name: "Infosys",       sector: "IT",         industry: "Software",        price: 1890,  change:  0.85, "RS-Ratio": 102.4, "RS-Momentum": 101.2, visible: true },
  { symbol: "HDFCBANK",   name: "HDFC Bank",     sector: "Banking",    industry: "Private Bank",    price: 1780,  change:  0.22, "RS-Ratio": 100.6, "RS-Momentum": 100.3, visible: true },
  { symbol: "ICICIBANK",  name: "ICICI Bank",    sector: "Banking",    industry: "Private Bank",    price: 1340,  change: -0.15, "RS-Ratio": 100.2, "RS-Momentum": 99.5,  visible: true },
  { symbol: "ITC",        name: "ITC",           sector: "Consumer",   industry: "FMCG",            price: 460,   change:  0.67, "RS-Ratio": 98.2,  "RS-Momentum": 101.1, visible: true },
  { symbol: "BHARTIARTL", name: "Bharti Airtel", sector: "Telecom",    industry: "Telecom",         price: 1640,  change:  1.45, "RS-Ratio": 104.2, "RS-Momentum": 102.0, visible: true },
  { symbol: "KOTAKBANK",  name: "Kotak Bank",    sector: "Banking",    industry: "Private Bank",    price: 1800,  change: -0.55, "RS-Ratio": 99.4,  "RS-Momentum": 98.6,  visible: true },
  { symbol: "LT",         name: "L&T",           sector: "Industrial", industry: "Construction",    price: 3550,  change:  0.30, "RS-Ratio": 101.0, "RS-Momentum": 100.5, visible: true },
  { symbol: "AXISBANK",   name: "Axis Bank",     sector: "Banking",    industry: "Private Bank",    price: 1180,  change: -0.78, "RS-Ratio": 97.5,  "RS-Momentum": 98.2,  visible: true },
  { symbol: "WIPRO",      name: "Wipro",         sector: "IT",         industry: "Software",        price: 560,   change:  0.92, "RS-Ratio": 96.8,  "RS-Momentum": 101.3, visible: true },
  { symbol: "MARUTI",     name: "Maruti Suzuki", sector: "Auto",       industry: "Automobile",      price: 11200, change:  0.18, "RS-Ratio": 105.4, "RS-Momentum": 100.8, visible: true },
  { symbol: "TATAMOTORS", name: "Tata Motors",   sector: "Auto",       industry: "Automobile",      price: 850,   change: -1.24, "RS-Ratio": 95.5,  "RS-Momentum": 97.8,  visible: true },
  { symbol: "SUNPHARMA",  name: "Sun Pharma",    sector: "Pharma",     industry: "Pharmaceuticals", price: 1820,  change:  0.56, "RS-Ratio": 103.0, "RS-Momentum": 100.2, visible: true },
];

const AUTO_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

const Index = () => {
  const [timeline, setTimeline] = useState("Weekly");
  const [benchmark] = useState("NIFTY 50");
  const [data, setData] = useState<StockData[]>(initialData);
  const [history, setHistory] = useState<HistoryMap>({});
  const [isLoading, setIsLoading] = useState(false);
  const [tailLength, setTailLength] = useState(7);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [dataSource, setDataSource] = useState<"placeholder" | "live">("placeholder");
  const [weekOffset, setWeekOffset] = useState(0);
  const chartRef = useRef<RRGChartRef>(null);

  // Compute total weeks available from history
  const totalWeeks = useMemo(() => {
    const lengths = Object.values(history).map(h => h.length);
    return lengths.length > 0 ? Math.max(...lengths, tailLength) : tailLength;
  }, [history, tailLength]);

  const fetchMarketData = useCallback(async (showToast = true) => {
    try {
      const { data: response, error } = await supabase.functions.invoke('get-market-data', {
        body: null,
        headers: {},
      });

      if (error) {
        console.error('Error fetching market data:', error);
        if (showToast) toast.error("Failed to fetch market data. Using placeholder data.");
        return;
      }

      // Handle new { stocks, history } shape or legacy flat array
      let marketStocks: any[] = [];
      let marketHistory: HistoryMap = {};

      if (response && typeof response === 'object' && !Array.isArray(response)) {
        marketStocks = response.stocks || [];
        marketHistory = response.history || {};
      } else if (Array.isArray(response)) {
        marketStocks = response;
      }

      if (marketStocks.length > 0) {
        const visibilityMap = new Map(data.map(d => [d.symbol, d.visible]));
        const enriched = marketStocks.map((item: StockData) => ({
          ...item,
          visible: visibilityMap.get(item.symbol) ?? true,
        }));
        setData(enriched);
        setHistory(marketHistory);
        setDataSource("live");
        setLastUpdated(new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }));
        if (showToast) toast.success(`Loaded ${enriched.length} stocks from Fyers`);
      } else {
        if (showToast) toast.info("No market data available yet. Using placeholders.");
      }
    } catch (error) {
      console.error('Error fetching market data:', error);
      if (showToast) toast.error("Failed to fetch market data.");
    }
  }, [data]);

  // Fetch initial data on mount
  useEffect(() => {
    fetchMarketData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      console.log('Auto-refreshing market data...');
      fetchMarketData(false);
    }, AUTO_REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [fetchMarketData]);

  // Realtime subscription for push updates
  useEffect(() => {
    const channel = supabase
      .channel('market-data-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'market_data' },
        () => {
          console.log('New market data inserted, refreshing...');
          fetchMarketData(false);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('Realtime subscription active');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchMarketData]);

  const handleFetchData = async () => {
    setIsLoading(true);
    toast.info("Fetching live data from Fyers API...");

    try {
      const { data: result, error: fetchError } = await supabase.functions.invoke('fetch-fyers-data');

      if (fetchError) {
        console.error('Error triggering Fyers fetch:', fetchError);
        toast.error("Failed to fetch from Fyers. Check API credentials.");
        setIsLoading(false);
        return;
      }

      // If the edge function returned data directly, use it
      if (result?.data && Array.isArray(result.data) && result.data.length > 0) {
        const visibilityMap = new Map(data.map(d => [d.symbol, d.visible]));
        const enriched = result.data.map((item: any) => ({
          symbol: item.symbol,
          name: item.name,
          sector: item.sector,
          industry: item.industry,
          price: item.price,
          change: item.change,
          "RS-Ratio": item.rs_ratio,
          "RS-Momentum": item.rs_momentum,
          visible: visibilityMap.get(item.symbol) ?? true,
        }));
        setData(enriched);

        // Append the new point to existing history for each symbol
        setHistory(prev => {
          const updated = { ...prev };
          for (const item of result.data) {
            const sym = item.symbol;
            const point = { "RS-Ratio": item.rs_ratio, "RS-Momentum": item.rs_momentum, fetched_at: new Date().toISOString() };
            if (!updated[sym]) updated[sym] = [];
            updated[sym] = [...updated[sym], point].slice(-tailLength);
          }
          return updated;
        });

        setDataSource("live");
        setLastUpdated(new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }));
        toast.success(`${enriched.length} live quotes loaded from Fyers`);
      } else {
        // Fallback: fetch from DB after a short delay
        await new Promise((r) => setTimeout(r, 2000));
        await fetchMarketData();
      }
    } catch (error) {
      console.error('Error in handleFetchData:', error);
      toast.error("An error occurred while fetching data.");
    } finally {
      setIsLoading(false);
    }
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
            NSE stocks vs {benchmark} — Powered by Fyers API
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

      <main className="flex-1 px-6 py-4 space-y-4">
        {/* Timeline slider */}
        <div className="w-full max-w-[1200px] mx-auto">
          <TimelineSlider
            totalWeeks={totalWeeks}
            windowSize={tailLength}
            endWeek={weekOffset}
            onWindowChange={setWeekOffset}
            endDateLabel={lastUpdated ? `${lastUpdated}` : undefined}
          />
        </div>

        {/* RRG Chart */}
        <div className="w-full flex justify-center">
          <div className="w-full max-w-[1200px] h-[660px] relative">
            <RRGChartZoomable
              ref={chartRef}
              data={data}
              tailLength={tailLength}
              history={history}
              weekOffset={weekOffset}
            />
          </div>
        </div>

        <StockTable data={data} onVisibilityToggle={handleVisibilityToggle} />
      </main>

      <footer className="border-t border-border bg-card py-3 px-6">
        <p className="text-xs text-muted-foreground text-center">
          {dataSource === "live" ? "🟢 Fyers Live Data" : "⚪ Placeholder Data"} | Benchmark: {benchmark} | {timeline}
          {lastUpdated && ` | Last updated: ${lastUpdated}`} | Auto-refresh every 5 min
        </p>
      </footer>
    </div>
  );
};

export default Index;
