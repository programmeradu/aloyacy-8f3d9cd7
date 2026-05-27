ALTER TABLE public.trip_history ADD COLUMN user_id uuid;
CREATE INDEX idx_trip_history_user_id ON public.trip_history(user_id);
CREATE INDEX IF NOT EXISTS idx_trip_history_device_id ON public.trip_history(device_id);