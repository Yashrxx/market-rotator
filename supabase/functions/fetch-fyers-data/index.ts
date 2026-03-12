import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/* -------------------------------------------------------------------
   STOCK SYMBOLS CONFIGURATION (NSE via Fyers format)
------------------------------------------------------------------- */

const stocks = [
  { fyers: 'NSE:SBIN-EQ', symbol: 'SBIN', name: 'SBI', sector: 'Banking', industry: 'PSU Bank' },
  { fyers: 'NSE:RELIANCE-EQ', symbol: 'RELIANCE', name: 'Reliance', sector: 'Energy', industry: 'Oil & Gas' },
  { fyers: 'NSE:TCS-EQ', symbol: 'TCS', name: 'TCS', sector: 'IT', industry: 'Software' },
  { fyers: 'NSE:INFY-EQ', symbol: 'INFY', name: 'Infosys', sector: 'IT', industry: 'Software' },
  { fyers: 'NSE:HDFCBANK-EQ', symbol: 'HDFCBANK', name: 'HDFC Bank', sector: 'Banking', industry: 'Private Bank' },
  { fyers: 'NSE:ICICIBANK-EQ', symbol: 'ICICIBANK', name: 'ICICI Bank', sector: 'Banking', industry: 'Private Bank' },
  { fyers: 'NSE:ITC-EQ', symbol: 'ITC', name: 'ITC', sector: 'Consumer', industry: 'FMCG' },
  { fyers: 'NSE:BHARTIARTL-EQ', symbol: 'BHARTIARTL', name: 'Bharti Airtel', sector: 'Telecom', industry: 'Telecom' },
  { fyers: 'NSE:KOTAKBANK-EQ', symbol: 'KOTAKBANK', name: 'Kotak Bank', sector: 'Banking', industry: 'Private Bank' },
  { fyers: 'NSE:LT-EQ', symbol: 'LT', name: 'L&T', sector: 'Industrial', industry: 'Construction' },
  { fyers: 'NSE:AXISBANK-EQ', symbol: 'AXISBANK', name: 'Axis Bank', sector: 'Banking', industry: 'Private Bank' },
  { fyers: 'NSE:WIPRO-EQ', symbol: 'WIPRO', name: 'Wipro', sector: 'IT', industry: 'Software' },
  { fyers: 'NSE:MARUTI-EQ', symbol: 'MARUTI', name: 'Maruti Suzuki', sector: 'Auto', industry: 'Automobile' },
  { fyers: 'NSE:TATAMOTORS-EQ', symbol: 'TATAMOTORS', name: 'Tata Motors', sector: 'Auto', industry: 'Automobile' },
  { fyers: 'NSE:SUNPHARMA-EQ', symbol: 'SUNPHARMA', name: 'Sun Pharma', sector: 'Pharma', industry: 'Pharmaceuticals' },
];

// Nifty 50 as benchmark
const BENCHMARK_FYERS = 'NSE:NIFTY50-INDEX';

/* -------------------------------------------------------------------
   FYERS API HELPERS
------------------------------------------------------------------- */

function getFyersBase(): string {
  const env = (Deno.env.get('FYERS_ENV') || 'live').toLowerCase();
  return env === 't1' || env === 'sandbox' || env === 'test'
    ? 'https://api-t1.fyers.in'
    : 'https://api.fyers.in';
}

async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Get a valid Fyers access token – checks cached tokens in DB first,
 * if expired or missing, refreshes using the refresh token flow.
 */
async function getValidAccessToken(supabase: any): Promise<string> {
  // 1. Check for a cached, non-expired token
  const { data: tokenRow } = await supabase
    .from('fyers_tokens')
    .select('access_token, expires_at')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (tokenRow?.access_token) {
    console.log('Using cached Fyers token, expires at:', tokenRow.expires_at);
    return tokenRow.access_token;
  }

  // 2. No valid token – refresh
  console.log('No valid cached token found. Refreshing...');
  const appId = Deno.env.get('FYERS_APP_ID');
  const secretKey = Deno.env.get('FYERS_SECRET_KEY');
  const refreshToken = Deno.env.get('FYERS_REFRESH_TOKEN');

  if (!appId || !secretKey || !refreshToken) {
    throw new Error(
      'Missing Fyers credentials. Set FYERS_APP_ID, FYERS_SECRET_KEY, and FYERS_REFRESH_TOKEN as Supabase secrets.'
    );
  }

  const appIdHash = await sha256Hex(`${appId}:${secretKey}`);
  const res = await fetch(`${getFyersBase()}/api/v3/validate-refresh-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      appIdHash,
      refresh_token: refreshToken,
      pin: secretKey,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Fyers token refresh failed (${res.status}): ${errText}`);
  }

  const tokenData = await res.json();
  if (!tokenData.access_token) {
    throw new Error('No access_token in Fyers refresh response: ' + JSON.stringify(tokenData));
  }

  // 3. Store the new token
  const expiresAt = new Date(Date.now() + 86400 * 1000).toISOString(); // ~24h
  await supabase.from('fyers_tokens').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('fyers_tokens').insert({
    access_token: tokenData.access_token,
    expires_at: expiresAt,
  });
  console.log('New Fyers token stored, expires at:', expiresAt);

  return tokenData.access_token;
}

/* -------------------------------------------------------------------
   FETCH QUOTES FROM FYERS API v3
------------------------------------------------------------------- */

interface FyersQuote {
  n: string;         // symbol identifier e.g. "NSE:SBIN-EQ"
  v: {
    lp: number;      // last traded price
    ch: number;      // absolute change
    chp: number;     // percent change
    open_price: number;
    high_price: number;
    low_price: number;
    prev_close_price: number;
    volume: number;
  };
}

async function fetchFyersQuotes(
  accessToken: string,
  appId: string,
): Promise<FyersQuote[]> {
  const allSymbols = [BENCHMARK_FYERS, ...stocks.map((s) => s.fyers)];
  const symbolsCsv = allSymbols.join(',');

  const url = `${getFyersBase()}/data-rest/v3/quotes/?symbols=${encodeURIComponent(symbolsCsv)}`;
  console.log('Fetching quotes from Fyers:', url);

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `${appId}:${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Fyers quotes API error (${res.status}): ${errText}`);
  }

  const json = await res.json();
  if (json.s !== 'ok' || !json.d) {
    throw new Error('Fyers quotes response error: ' + JSON.stringify(json));
  }

  return json.d as FyersQuote[];
}

/* -------------------------------------------------------------------
   RS-RATIO & RS-MOMENTUM CALCULATION
   RS-Ratio   = (stock price / benchmark price) * 100 (normalised)
   RS-Momentum = rate-of-change of RS-Ratio (approx from % change)
------------------------------------------------------------------- */

function calculateRSMetrics(
  stockPrice: number,
  stockChangePct: number,
  benchmarkPrice: number,
  benchmarkChangePct: number,
) {
  // Relative Strength line = stock / benchmark, normalised around 100
  const rsLine = (stockPrice / benchmarkPrice) * 100;

  // Approximate yesterday's RS line from % changes
  const prevStock = stockPrice / (1 + stockChangePct / 100);
  const prevBench = benchmarkPrice / (1 + benchmarkChangePct / 100);
  const prevRsLine = (prevStock / prevBench) * 100;

  // RS-Ratio: the RS line value itself (already around ~100 scale)
  const rsRatio = rsLine;

  // RS-Momentum: rate of change of the RS line, scaled around 100
  const rsMomentum = prevRsLine !== 0 ? (rsLine / prevRsLine) * 100 : 100;

  return {
    rsRatio: Math.round(rsRatio * 100) / 100,
    rsMomentum: Math.round(rsMomentum * 100) / 100,
  };
}

/* -------------------------------------------------------------------
   MAIN: BUILD MARKET DATA ROWS
------------------------------------------------------------------- */

async function fetchMarketData(supabase: any) {
  const appId = Deno.env.get('FYERS_APP_ID')!;
  const accessToken = await getValidAccessToken(supabase);
  const quotes = await fetchFyersQuotes(accessToken, appId);

  // Build a lookup map: fyers symbol ➜ quote
  const quoteMap = new Map<string, FyersQuote>();
  for (const q of quotes) {
    quoteMap.set(q.n, q);
  }

  // Get benchmark quote
  const benchQ = quoteMap.get(BENCHMARK_FYERS);
  if (!benchQ) throw new Error('Benchmark quote not found in Fyers response');
  const benchPrice = benchQ.v.lp;
  const benchChgPct = benchQ.v.chp;
  console.log(`Benchmark (Nifty 50): ₹${benchPrice} (${benchChgPct >= 0 ? '+' : ''}${benchChgPct}%)`);

  const results: any[] = [];

  for (const stock of stocks) {
    const q = quoteMap.get(stock.fyers);
    if (!q) {
      console.warn(`⚠️ No quote for ${stock.fyers}, skipping`);
      continue;
    }

    const price = q.v.lp;
    const changePct = q.v.chp;
    const { rsRatio, rsMomentum } = calculateRSMetrics(price, changePct, benchPrice, benchChgPct);

    results.push({
      symbol: stock.symbol,
      name: stock.name,
      sector: stock.sector,
      industry: stock.industry,
      price: Math.round(price * 100) / 100,
      change: Math.round(changePct * 100) / 100,
      rs_ratio: rsRatio,
      rs_momentum: rsMomentum,
    });

    const sign = changePct >= 0 ? '+' : '';
    console.log(`✓ ${stock.name}: ₹${price.toFixed(2)} (${sign}${changePct.toFixed(2)}%) RS-R:${rsRatio} RS-M:${rsMomentum}`);
  }

  return results;
}

/* -------------------------------------------------------------------
   HTTP SERVER (DENO)
------------------------------------------------------------------- */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    console.info('Fetching live market data from Fyers...');
    const data = await fetchMarketData(supabase);
    console.info(`Fetched ${data.length} live quotes`);

    if (data.length > 0) {
      const { error: insertError } = await supabase.from('market_data').insert(data);
      if (insertError) {
        console.error('Failed to insert data:', insertError);
        throw new Error(`Database insert failed: ${insertError.message}`);
      }
      console.log(`Successfully stored ${data.length} quotes in database.`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        data,
        source: 'fyers_live',
        message: `Fetched and stored ${data.length} live quotes from Fyers`,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: any) {
    console.error('❌ ERROR:', err);
    return new Response(
      JSON.stringify({
        error: err.message,
        details: 'Failed to fetch/store market data from Fyers API',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
    );
  }
});
