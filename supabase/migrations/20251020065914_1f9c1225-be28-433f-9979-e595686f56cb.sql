-- Create table for storing market data from FYERS
CREATE TABLE public.market_data (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  sector TEXT NOT NULL,
  industry TEXT NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  change DECIMAL(5, 2) NOT NULL,
  rs_ratio DECIMAL(6, 2) NOT NULL,
  rs_momentum DECIMAL(6, 2) NOT NULL,
  fetched_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for faster symbol lookups
CREATE INDEX idx_market_data_symbol ON public.market_data(symbol);

-- Create index for fetched_at to efficiently get latest data
CREATE INDEX idx_market_data_fetched_at ON public.market_data(fetched_at DESC);

-- Enable Row Level Security
ALTER TABLE public.market_data ENABLE ROW LEVEL SECURITY;

-- Create policy to allow public read access (no authentication needed)
CREATE POLICY "Allow public read access to market data" 
ON public.market_data 
FOR SELECT 
USING (true);

-- Create policy to allow service role to insert data (for backend function)
CREATE POLICY "Allow service role to insert market data" 
ON public.market_data 
FOR INSERT 
WITH CHECK (true);