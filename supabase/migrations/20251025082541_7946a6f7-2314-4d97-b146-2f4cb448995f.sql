-- Fix function search path security issue
DROP TRIGGER IF EXISTS update_fyers_tokens_updated_at ON public.fyers_tokens;
DROP FUNCTION IF EXISTS public.update_fyers_tokens_updated_at();

CREATE OR REPLACE FUNCTION public.update_fyers_tokens_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_fyers_tokens_updated_at
BEFORE UPDATE ON public.fyers_tokens
FOR EACH ROW
EXECUTE FUNCTION public.update_fyers_tokens_updated_at();