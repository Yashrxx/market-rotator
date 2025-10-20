import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get the latest data for each symbol
    const { data: latestData, error } = await supabase
      .from('market_data')
      .select('*')
      .order('fetched_at', { ascending: false });

    if (error) {
      console.error('Error fetching market data:', error);
      throw error;
    }

    // Group by symbol and get the latest entry for each
    const uniqueSymbols = new Map();
    latestData?.forEach(item => {
      if (!uniqueSymbols.has(item.symbol)) {
        uniqueSymbols.set(item.symbol, item);
      }
    });

    const result = Array.from(uniqueSymbols.values()).map(item => ({
      symbol: item.symbol,
      name: item.name,
      sector: item.sector,
      industry: item.industry,
      price: parseFloat(item.price),
      change: parseFloat(item.change),
      "RS-Ratio": parseFloat(item.rs_ratio),
      "RS-Momentum": parseFloat(item.rs_momentum),
      visible: true
    }));

    console.log(`Returning ${result.length} market data records`);

    return new Response(
      JSON.stringify(result),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Error in get-market-data:', error);
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
