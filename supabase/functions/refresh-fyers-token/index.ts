import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FyersTokenResponse {
  access_token: string;
  expires_in?: number;
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

function getFyersBase(): string {
  // Default to live/production environment
  const env = (Deno.env.get('FYERS_ENV') || 'live').toLowerCase();
  return env === 't1' || env === 'sandbox' || env === 'test'
    ? 'https://api-t1.fyers.in'
    : 'https://api.fyers.in';
}

async function refreshFyersToken(): Promise<string> {
  const appId = Deno.env.get('FYERS_APP_ID');
  const secretKey = Deno.env.get('FYERS_SECRET_KEY');
  const refreshToken = Deno.env.get('FYERS_REFRESH_TOKEN');

  if (!appId || !secretKey || !refreshToken) {
    throw new Error('Missing Fyers credentials. Please configure FYERS_APP_ID, FYERS_SECRET_KEY, and FYERS_REFRESH_TOKEN');
  }

  console.log('Refreshing Fyers access token...');

  // Call Fyers API to refresh token
  const appIdHash = await sha256Hex(`${appId}:${secretKey}`);
  const response = await fetch(`${getFyersBase()}/api/v2/validate-refresh-token`, {
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

  const data: FyersTokenResponse = await response.json();
  console.log('Token refreshed successfully');

  if (!data.access_token) {
    throw new Error('No access token in response');
  }

  return data.access_token;
}

async function storeToken(accessToken: string, expiresIn: number = 86400) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const expiresAt = new Date(Date.now() + expiresIn * 1000);

  // Delete old tokens
  await supabase.from('fyers_tokens').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  // Insert new token
  const { error } = await supabase.from('fyers_tokens').insert({
    access_token: accessToken,
    expires_at: expiresAt.toISOString(),
  });

  if (error) {
    console.error('Error storing token:', error);
    throw error;
  }

  console.log('Token stored successfully, expires at:', expiresAt.toISOString());
}

async function getValidToken(): Promise<string> {
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

  // Otherwise, refresh and store new token
  console.log('No valid cached token, refreshing...');
  const newToken = await refreshFyersToken();
  await storeToken(newToken);
  return newToken;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const accessToken = await getValidToken();

    return new Response(
      JSON.stringify({
        success: true,
        access_token: accessToken,
        message: 'Valid access token retrieved',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error in refresh-fyers-token:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({
        error: errorMessage,
        details: 'Check function logs for more information',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
