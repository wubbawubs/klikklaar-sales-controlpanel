-- Schedule daily closer reminders at 07:00 UTC (08:00/09:00 NL)
SELECT cron.schedule(
  'closer-reminders-daily',
  '0 7 * * *',
  $$
  SELECT net.http_post(
    url := 'https://gdeeigztmbvdpcgdpzdv.supabase.co/functions/v1/closer-reminders',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdkZWVpZ3p0bWJ2ZHBjZ2RwemR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNDc0MjAsImV4cCI6MjA4OTkyMzQyMH0.sCu0LnWv1xvDQZJVVl0umv16YCPv46iT6pGy3_Qre8E"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);