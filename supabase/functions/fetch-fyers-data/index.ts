import { createClient } from '@supabase/supabase-js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/* -------------------------------------------------------------------
   FYERS TYPES + RS METRICS
------------------------------------------------------------------- */

interface FYERSQuoteData {
  symbol: string;
  ltp: number;
  ch: number;
  chp: number;
}

// Simplified RS Metrics (for RRG-like visualization)
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
   CRYPTO + FYERS ENV HELPERS
------------------------------------------------------------------- */

async function sha256Hex(input: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function getFyersBase(): string {
  const env = (Deno.env.get('FYERS_ENV') || 'live').toLowerCase();
  return env === 't1' || env === 'sandbox' || env === 'test'
    ? 'https://api-t1.fyers.in'
    : 'https://api.fyers.in';
}

/* -------------------------------------------------------------------
   TOKEN HANDLING (Supabase)
------------------------------------------------------------------- */

async function getValidAccessToken(): Promise<string> {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: tokenData } = await supabase
    .from('fyers_tokens')
    .select('*')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (tokenData?.access_token) {
    console.log('Using cached token until:', tokenData.expires_at);
    return tokenData.access_token;
  }

  // Refresh token if none is valid
  console.log('Cached token expired → refreshing…');
  return await refreshFyersToken();
}

async function refreshFyersToken(): Promise<string> {
  const appId = Deno.env.get('FYERS_APP_ID');
  const secretKey = Deno.env.get('FYERS_SECRET_KEY');
  const refreshToken = Deno.env.get('FYERS_REFRESH_TOKEN');

  if (!appId || !secretKey || !refreshToken) {
    throw new Error('Missing FYERS credentials');
  }

  console.log('Refreshing FYERS access token…');

  const appIdHash = await sha256Hex(`${appId}:${secretKey}`);

  const response = await fetch(`${getFyersBase()}/api/v3/validate-refresh-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      appIdHash,
      refresh_token: refreshToken,
      pin: secretKey,
    }),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const data = await response.json();
  const accessToken = data.access_token;

  if (!accessToken) {
    throw new Error('Token refresh failed: No access_token in response');
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  await supabase.from('fyers_tokens').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  await supabase.from('fyers_tokens').insert({
    access_token: accessToken,
    expires_at: expiresAt,
  });

  console.log('New FYERS token stored successfully.');
  return accessToken;
}

/* -------------------------------------------------------------------
   FETCH FYERS v3 QUOTE DATA
------------------------------------------------------------------- */

const symbols = [
  { symbol: 'NSE:SBIN-EQ', name: 'SBI', sector: 'Banking', industry: 'PSU Bank' },
  { symbol: 'NSE:RELIANCE-EQ', name: 'Reliance', sector: 'Energy', industry: 'Oil & Gas' },
  { symbol: 'NSE:TCS-EQ', name: 'TCS', sector: 'IT', industry: 'Software' },
  { symbol: 'NSE:INFY-EQ', name: 'Infosys', sector: 'IT', industry: 'Software' },
  { symbol: 'NSE:HDFCBANK-EQ', name: 'HDFC Bank', sector: 'Banking', industry: 'Private Bank' },
  { symbol: 'NSE:ICICIBANK-EQ', name: 'ICICI Bank', sector: 'Banking', industry: 'Private Bank' },
];

async function fetchFYERSData(accessToken: string) {
  const appId = Deno.env.get('FYERS_APP_ID')!;
  const results: any[] = [];

  for (const item of symbols) {
    try {
      const url = `${getFyersBase()}/data-rest/v3/quotes?symbols=${encodeURIComponent(item.symbol)}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${appId}:${accessToken}` },
      });

      const json = await response.json();
      const data = json.d?.[0];

      if (!data?.v) continue;

      const price = data.v.lp ?? 0;
      const change = data.v.chp ?? 0;

      const rs = calculateRSMetrics(price, change);

      results.push({
        ...item,
        price,
        change,
        rs_ratio: rs.rsRatio,
        rs_momentum: rs.rsMomentum,
        date: new Date().toISOString().split('T')[0],
      });
    } catch (err) {
      console.error(`Failed fetching ${item.symbol}`, err);
    }
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
    const accessToken = await getValidAccessToken();
    const data = await fetchFYERSData(accessToken);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    await supabase.from('market_data').insert(data);

    console.log(`Stored ${data.length} quotes in Supabase.`);

    return new Response(JSON.stringify({ success: true, data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('❌ ERROR:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});