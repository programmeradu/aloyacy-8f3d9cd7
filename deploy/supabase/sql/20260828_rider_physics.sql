-- C1: store a 0..1 physics score on each rider GPS fix.
-- Fusion ignores rows below 0.25; 0.6+ can override a stale feed ping.

alter table public.rider_vehicle_fixes
  add column if not exists physics_score real;

comment on column public.rider_vehicle_fixes.physics_score is
  '0..1 plausibility (snap, speed, progress, accuracy, dwell). Null means un scored.';

notify pgrst, 'reload schema';
