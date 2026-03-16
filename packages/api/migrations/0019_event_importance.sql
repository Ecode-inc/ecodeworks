ALTER TABLE events ADD COLUMN importance TEXT DEFAULT 'normal' CHECK(importance IN ('normal', 'important'));
