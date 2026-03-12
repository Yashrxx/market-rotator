import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  console.log('Incoming request:', req.method);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not defined');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse optional tailLength from query string (default 10)
    const url = new URL(req.url);
    const tailLength = Math.min(Math.max(parseInt(url.searchParams.get('tail') || '10') || 10, 1), 50);

    console.log(`Fetching market data with tail length: ${tailLength}`);

    // Fetch ALL rows ordered by time descending – we'll group client-side
    const { data: allData, error } = await supabase
      .from('market_data')
      .select('*')
      .order('fetched_at', { ascending: false });

    if (error) {
      console.error('❌ Supabase query error:', error);
      throw error;
    }

    if (!allData || allData.length === 0) {
      return new Response(
        JSON.stringify({ stocks: [], history: {} }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    console.log(`✅ Retrieved ${allData.length} total rows`);

    // Group rows by symbol, keeping up to tailLength entries per symbol
    const historyMap: Record<string, any[]> = {};
    const latestMap = new Map<string, any>();

    for (const item of allData) {
      const sym = item.symbol;

      // Keep track of the latest entry per symbol
      if (!latestMap.has(sym)) {
        latestMap.set(sym, item);
      }

      // Collect history (up to tailLength points per symbol)
      if (!historyMap[sym]) {
        historyMap[sym] = [];
      }
      if (historyMap[sym].length < tailLength) {
        historyMap[sym].push({
          "RS-Ratio": parseFloat(item.rs_ratio),
          "RS-Momentum": parseFloat(item.rs_momentum),
          fetched_at: item.fetched_at,
        });
      }
    }

    // Build the latest-state array (one entry per symbol)
    const stocks = Array.from(latestMap.values()).map(item => ({
      symbol: item.symbol,
      name: item.name,
      sector: item.sector,
      industry: item.industry,
      price: parseFloat(item.price),
      change: parseFloat(item.change),
      "RS-Ratio": parseFloat(item.rs_ratio),
      "RS-Momentum": parseFloat(item.rs_momentum),
      visible: true,
    }));

    // Reverse each history array so oldest comes first (tail draws old→new)
    const history: Record<string, any[]> = {};
    for (const sym of Object.keys(historyMap)) {
      history[sym] = historyMap[sym].reverse();
    }

    console.log(`✅ ${stocks.length} unique symbols, history depth up to ${tailLength}`);

    return new Response(
      JSON.stringify({ stocks, history }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('🔥 Error in get-market-data function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({
        error: errorMessage,
        details: 'Check function logs for more information.',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});