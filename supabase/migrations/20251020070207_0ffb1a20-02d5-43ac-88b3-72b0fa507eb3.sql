-- Recreate the cron job (extensions already exist in proper schemas)
SELECT cron.schedule(
  'fetch-fyers-data-hourly',
  '0 * * * *',
  $$
  SELECT
    net.http_post(
      url:='https://hlxtepntckhdfmbhyxug.supabase.co/functions/v1/fetch-fyers-data',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhseHRlcG50Y2toZGZtYmh5eHVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA4OTc0MDAsImV4cCI6MjA3NjQ3MzQwMH0.589JmQaelHs13jEX2tDvj6rXDJC7Mi1o_3QnfLIIR8I"}'::jsonb,
      body:='{}'::jsonb
    ) as request_id;
  $$
);