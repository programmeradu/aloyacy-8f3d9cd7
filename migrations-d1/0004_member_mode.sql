-- Optional travel mode for group members (walk | bus | bike | taxi), posted with
-- position pings and shown as a badge on the member's avatar. NULL = unknown.
-- Local only until reviewed: do not apply to remote without sign-off.
ALTER TABLE trip_group_members ADD COLUMN mode TEXT;
