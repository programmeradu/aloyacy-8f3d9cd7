-- Optional rider-chosen group avatar (character id from the picker, e.g. "p3"
-- or "a1"). NULL = not chosen yet (the app shows a neutral face).
ALTER TABLE trip_group_members ADD COLUMN avatar TEXT;
