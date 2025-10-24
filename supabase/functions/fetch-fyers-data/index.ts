import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FYERSQuoteData {
  symbol: string;
  ltp: number;
  ch: number;
  chp: number;
}

// Calculate RS-Ratio and RS-Momentum (simplified calculation for demo)
function calculateRSMetrics(price: number, change: number, benchmarkPrice: number = 4536.89) {
  // RS-Ratio: Relative performance vs benchmark (normalized to 100)
  const relativePerformance = (price / benchmarkPrice) * 100;
  const rsRatio = relativePerformance + (Math.random() - 0.5) * 10; // Add some variance
  
  // RS-Momentum: Rate of change in RS-Ratio
  const rsMomentum = 100 + change * 0.5 + (Math.random() - 0.5) * 5;
  
  return {
    rsRatio: Math.max(85, Math.min(115, rsRatio)),
    rsMomentum: Math.max(85, Math.min(115, rsMomentum))
  };
}

async function fetchFYERSData(accessToken: string) {
  // Define symbols to fetch
  const symbols = [
    { symbol: "NSE:NIFTY50-INDEX", name: "Nifty 50", sector: "Index", industry: "Broad Market" },
    { symbol: "NSE:NIFTYNXT50-INDEX", name: "Nifty Next 50", sector: "Index", industry: "Mid Cap" },
    { symbol: "NSE:NIFTYBANK-INDEX", name: "Nifty Bank", sector: "Index", industry: "Banking" },
    { symbol: "NSE:NIFTYIT-INDEX", name: "Nifty IT", sector: "Index", industry: "Technology" },
    { symbol: "NSE:NIFTYAUTO-INDEX", name: "Nifty Auto", sector: "Index", industry: "Automobile" },
    { symbol: "NSE:NIFTYPHARMA-INDEX", name: "Nifty Pharma", sector: "Index", industry: "Pharmaceutical" },
    { symbol: "NSE:NIFTYFMCG-INDEX", name: "Nifty FMCG", sector: "Index", industry: "Consumer" },
    { symbol: "NSE:NIFTYMETAL-INDEX", name: "Nifty Metal", sector: "Index", industry: "Metals" }
  ];

  const marketData = [];

  for (const item of symbols) {
    try {
      // Fetch quote data from FYERS
      const response = await fetch(`https://api-t1.fyers.in/api/v3/quotes`, {
        method: 'POST',
        headers: {
          'Authorization': accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          symbols: item.symbol
        })
      });

      if (!response.ok) {
        console.error(`Failed to fetch data for ${item.symbol}:`, await response.text());
        continue;
      }

      const data = await response.json();
      console.log(`FYERS response for ${item.symbol}:`, JSON.stringify(data));

      // Extract data from FYERS response
      const quoteData = data.d?.[0];
      if (quoteData && quoteData.v) {
        const price = quoteData.v.lp || 0;
        const change = quoteData.v.ch_per || 0;
        
        const { rsRatio, rsMomentum } = calculateRSMetrics(price, change);

        marketData.push({
          symbol: item.symbol,
          name: item.name,
          sector: item.sector,
          industry: item.industry,
          price: price,
          change: change,
          rs_ratio: rsRatio,
          rs_momentum: rsMomentum,
        });
      }
    } catch (error) {
      console.error(`Error fetching ${item.symbol}:`, error);
    }
  }

  return marketData;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Fetching FYERS data...');

    // Get the access token from environment
    const accessToken = Deno.env.get('FYERS_ACCESS_TOKEN');

    if (!accessToken) {
      throw new Error('FYERS_ACCESS_TOKEN not configured. Please add your FYERS access token in the secrets.');
    }

    console.log('Using FYERS access token...');

    const marketData = await fetchFYERSData(accessToken);

    // Store data in Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { error: insertError } = await supabase
      .from('market_data')
      .insert(marketData);

    if (insertError) {
      console.error('Error inserting data:', insertError);
      throw insertError;
    }

    console.log(`Successfully fetched and stored ${marketData.length} records`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        count: marketData.length,
        message: 'Market data fetched and stored successfully'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Error in fetch-fyers-data:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        details: 'Check function logs for more information'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
