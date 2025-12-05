import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/* -------------------------------------------------------------------
   RS METRICS CALCULATION
------------------------------------------------------------------- */

function calculateRSMetrics(price: number, change: number, benchmarkPrice: number = 4536.89) {
  const relativePerformance = (price / benchmarkPrice) * 100;
  const rsRatio = relativePerformance + (Math.random() - 0.5) * 10;
  const rsMomentum = 100 + change * 0.5 + (Math.random() - 0.5) * 5;

  return {
    rsRatio: Math.max(85, Math.min(115, rsRatio)),
    rsMomentum: Math.max(85, Math.min(115, rsMomentum)),
  };
}

/* -------------------------------------------------------------------
   STOCK SYMBOLS CONFIGURATION
------------------------------------------------------------------- */

const stocks = [
  { symbol: 'SBIN', name: 'SBI', sector: 'Banking', industry: 'PSU Bank', basePrice: 850 },
  { symbol: 'RELIANCE', name: 'Reliance', sector: 'Energy', industry: 'Oil & Gas', basePrice: 1290 },
  { symbol: 'TCS', name: 'TCS', sector: 'IT', industry: 'Software', basePrice: 4100 },
  { symbol: 'INFY', name: 'Infosys', sector: 'IT', industry: 'Software', basePrice: 1890 },
  { symbol: 'HDFCBANK', name: 'HDFC Bank', sector: 'Banking', industry: 'Private Bank', basePrice: 1780 },
  { symbol: 'ICICIBANK', name: 'ICICI Bank', sector: 'Banking', industry: 'Private Bank', basePrice: 1340 },
  { symbol: 'ITC', name: 'ITC', sector: 'Consumer', industry: 'FMCG', basePrice: 460 },
  { symbol: 'BHARTIARTL', name: 'Bharti Airtel', sector: 'Telecom', industry: 'Telecom', basePrice: 1640 },
  { symbol: 'KOTAKBANK', name: 'Kotak Bank', sector: 'Banking', industry: 'Private Bank', basePrice: 1800 },
  { symbol: 'LT', name: 'L&T', sector: 'Industrial', industry: 'Construction', basePrice: 3550 },
  { symbol: 'AXISBANK', name: 'Axis Bank', sector: 'Banking', industry: 'Private Bank', basePrice: 1180 },
  { symbol: 'WIPRO', name: 'Wipro', sector: 'IT', industry: 'Software', basePrice: 560 },
  { symbol: 'MARUTI', name: 'Maruti Suzuki', sector: 'Auto', industry: 'Automobile', basePrice: 11200 },
  { symbol: 'TATAMOTORS', name: 'Tata Motors', sector: 'Auto', industry: 'Automobile', basePrice: 850 },
  { symbol: 'SUNPHARMA', name: 'Sun Pharma', sector: 'Pharma', industry: 'Pharmaceuticals', basePrice: 1820 },
];

/* -------------------------------------------------------------------
   FETCH MARKET DATA - REALISTIC SIMULATION
   (Since free APIs are blocking, we simulate realistic market behavior)
------------------------------------------------------------------- */

async function fetchMarketData() {
  const results: any[] = [];
  
  console.log('Generating market data with realistic simulation...');
  
  // Get current market hours info (IST)
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
  const istTime = new Date(now.getTime() + istOffset);
  const hour = istTime.getUTCHours();
  const dayOfWeek = istTime.getUTCDay();
  
  // Market is open Mon-Fri, 9:15 AM - 3:30 PM IST
  const isMarketHours = dayOfWeek >= 1 && dayOfWeek <= 5 && hour >= 9 && hour < 16;
  
  console.log(`Current IST time: ${istTime.toISOString()}, Market open: ${isMarketHours}`);
  
  // Seed random based on time to get consistent-ish prices during day
  const timeSeed = Math.floor(now.getTime() / (5 * 60 * 1000)); // Changes every 5 mins
  
  for (const stock of stocks) {
    // Generate realistic price movement
    const volatility = 0.02; // 2% volatility
    const trend = Math.sin(timeSeed * 0.1 + stock.basePrice) * 0.01; // Slight trend
    const randomWalk = (seededRandom(timeSeed + hashCode(stock.symbol)) - 0.5) * volatility;
    
    const priceChange = trend + randomWalk;
    const price = stock.basePrice * (1 + priceChange);
    const changePercent = priceChange * 100;
    
    const rs = calculateRSMetrics(price, changePercent);
    
    results.push({
      symbol: stock.symbol,
      name: stock.name,
      sector: stock.sector,
      industry: stock.industry,
      price: Math.round(price * 100) / 100,
      change: Math.round(changePercent * 100) / 100,
      rs_ratio: rs.rsRatio,
      rs_momentum: rs.rsMomentum,
    });
    
    const changeStr = changePercent >= 0 ? `+${changePercent.toFixed(2)}` : changePercent.toFixed(2);
    console.log(`✓ ${stock.name}: ₹${price.toFixed(2)} (${changeStr}%)`);
  }

  return results;
}

// Simple hash function for consistent randomness
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

// Seeded random function for reproducible results
function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

/* -------------------------------------------------------------------
   HTTP SERVER (DENO)
------------------------------------------------------------------- */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.info('Fetching market data...');
    const data = await fetchMarketData();

    console.info(`Generated ${data.length} market data records`);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    if (data.length > 0) {
      const { error: insertError } = await supabase.from('market_data').insert(data);
      if (insertError) {
        console.error('Failed to insert data:', insertError);
        throw new Error(`Database insert failed: ${insertError.message}`);
      }
      console.log(`Successfully stored ${data.length} quotes in database.`);
    }

    return new Response(JSON.stringify({ 
      success: true, 
      data,
      source: 'simulated_market',
      message: `Generated ${data.length} market data records`,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('❌ ERROR:', err);
    return new Response(JSON.stringify({ 
      error: err.message,
      details: 'Failed to generate/store market data'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
