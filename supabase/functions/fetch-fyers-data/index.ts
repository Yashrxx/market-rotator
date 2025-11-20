import { createClient } from '@supabase/supabase-js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// --- Step 1: Extended Sectors ---
const sectors = [
  { symbol: "NSE:NIFTY50-INDEX", name: "Nifty 50", sector: "Index", industry: "Broad Market" },
  { symbol: "NSE:NIFTYNXT50-INDEX", name: "Nifty Next 50", sector: "Index", industry: "Mid Cap" },
  { symbol: "NSE:NIFTYBANK-INDEX", name: "Nifty Bank", sector: "Banking", industry: "Financials" },
  { symbol: "NSE:NIFTYIT-INDEX", name: "Nifty IT", sector: "Technology", industry: "IT Services" },
  { symbol: "NSE:NIFTYAUTO-INDEX", name: "Nifty Auto", sector: "Automobile", industry: "Manufacturing" },
  { symbol: "NSE:NIFTYPHARMA-INDEX", name: "Nifty Pharma", sector: "Healthcare", industry: "Pharma" },
  { symbol: "NSE:NIFTYFMCG-INDEX", name: "Nifty FMCG", sector: "Consumer", industry: "FMCG" },
  { symbol: "NSE:NIFTYMETAL-INDEX", name: "Nifty Metal", sector: "Commodities", industry: "Metal" },
];

// --- Step 2: Calculations ---
function calculateRSandROC(prices: number[]) {
  if (prices.length < 2) return { rs_ratio: 100, rs_smooth: 100, roc: 0 };

  const rs_ratio = (prices[prices.length - 1] / prices[0]) * 100;
  const rs_smooth = rs_ratio * 0.9 + 10;
  const roc = ((prices[prices.length - 1] - prices[prices.length - 2]) / prices[prices.length - 2]) * 100;

  return { rs_ratio, rs_smooth, roc };
}

async function fetchFYERSData(accessToken: string) {
  const results = [];

  for (const s of sectors) {
    try {
      const response = await fetch('https://api-t1.fyers.in/api/v3/quotes', {
        method: 'POST',
        headers: {
          Authorization: accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ symbols: s.symbol }),
      });

      const data = await response.json();
      const quote = data.d?.[0];

      if (!quote?.v) continue;
      const price = quote.v.lp || 0;
      const change = quote.v.ch_per || 0;

      // Just using one price as sample; replace with time-series from Fyers if needed
      const priceSeries = [price - 5, price - 3, price];
      const { rs_ratio, rs_smooth, roc } = calculateRSandROC(priceSeries);

      results.push({
        symbol: s.symbol,
        name: s.name,
        sector: s.sector,
        industry: s.industry,
        price,
        change,
        rs_ratio,
        rs_smooth,
        roc,
        date: new Date().toISOString().split('T')[0],
      });
    } catch (err) {
      console.error(`Error fetching ${s.symbol}:`, err);
    }
  }

  return results;
}

// --- Step 3: Deno Serve ---
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const accessToken = Deno.env.get('FYERS_ACCESS_TOKEN');
    if (!accessToken) throw new Error('FYERS_ACCESS_TOKEN not set');

    const marketData = await fetchFYERSData(accessToken);

    // Store JSON data to Supabase
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { error } = await supabase.from('market_data').insert(marketData);
    if (error) throw error;

    console.log(`✅ Stored ${marketData.length} records`);

    return new Response(JSON.stringify({ success: true, data: marketData }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('❌ Error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});