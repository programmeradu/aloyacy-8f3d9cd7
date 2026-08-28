-- C1 rider physics score. Mirror of deploy/supabase/sql/20260828_rider_physics.sql.

ALTER TABLE public.rider_vehicle_fixes
  ADD COLUMN IF NOT EXISTS physics_score real;

COMMENT ON COLUMN public.rider_vehicle_fixes.physics_score IS
  '0..1 plausibility (snap, speed, progress, accuracy, dwell). Null means unscored.';
