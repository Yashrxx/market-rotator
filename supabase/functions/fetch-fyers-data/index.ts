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

// Helper to compute SHA-256 hex (required for FYERS appIdHash)
async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

async function getValidAccessToken(): Promise<string> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Check if we have a valid token in database
  const { data: tokenData, error } = await supabase
    .from('fyers_tokens')
    .select('*')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Error fetching token:', error);
  }

  // If we have a valid token, return it
  if (tokenData?.access_token) {
    console.log('Using cached token, expires at:', tokenData.expires_at);
    return tokenData.access_token;
  }

  // Otherwise, try env fallback then refresh token
  const envToken = Deno.env.get('FYERS_ACCESS_TOKEN');
  if (envToken) {
    console.log('Using FYERS_ACCESS_TOKEN from environment');
    return envToken;
  }

  console.log('No valid cached token, refreshing...');
  return await refreshFyersToken();
}

async function refreshFyersToken(): Promise<string> {
  const appId = Deno.env.get('FYERS_APP_ID');
  const secretKey = Deno.env.get('FYERS_SECRET_KEY');
  const refreshToken = Deno.env.get('FYERS_REFRESH_TOKEN');

  if (!appId || !secretKey || !refreshToken) {
    throw new Error('Missing Fyers credentials');
  }

  console.log('Refreshing Fyers access token...');

  const appIdHash = await sha256Hex(`${appId}:${secretKey}`);

  const response = await fetch('https://api.fyers.in/api/v3/validate-refresh-token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      appIdHash,
      refresh_token: refreshToken,
      pin: secretKey,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Failed to refresh Fyers token:', errorText);
    throw new Error(`Failed to refresh token: ${errorText}`);
  }

  const data = await response.json();
  const accessToken = data.access_token;

  if (!accessToken) {
    throw new Error('No access token in response');
  }

  // Store the new token
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const expiresAt = new Date(Date.now() + 86400 * 1000); // 24 hours

  await supabase.from('fyers_tokens').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('fyers_tokens').insert({
    access_token: accessToken,
    expires_at: expiresAt.toISOString(),
  });

  console.log('Token refreshed and stored successfully');
  return accessToken;
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
      const appId = Deno.env.get('FYERS_APP_ID')!;
      const url = `https://api-t1.fyers.in/data-rest/v2/quotes/?symbols=${encodeURIComponent(item.symbol)}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${appId}:${accessToken}`,
        }
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
    console.log('Fetching FYERS data with automatic token refresh...');

    // Get valid access token (will auto-refresh if needed)
    const accessToken = await getValidAccessToken();

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
