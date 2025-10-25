-- Create table to store Fyers access token
CREATE TABLE IF NOT EXISTS public.fyers_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  access_token TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.fyers_tokens ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role can manage tokens"
ON public.fyers_tokens
FOR ALL
USING (true)
WITH CHECK (true);

-- Create function to update timestamp
CREATE OR REPLACE FUNCTION public.update_fyers_tokens_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER update_fyers_tokens_updated_at
BEFORE UPDATE ON public.fyers_tokens
FOR EACH ROW
EXECUTE FUNCTION public.update_fyers_tokens_updated_at();