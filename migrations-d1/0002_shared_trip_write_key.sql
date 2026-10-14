-- Live ETA shares are now written through /api/public/eta-share instead of
-- straight from the mobile client. The read token is public (it is in the
-- share link), so updates need a second capability: the SHA-256 of a random
-- write key handed only to the device that created the share.
ALTER TABLE shared_trips ADD COLUMN write_key_hash TEXT;
