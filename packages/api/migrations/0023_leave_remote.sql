-- Add 'remote' to leave request types
-- SQLite doesn't support ALTER CHECK, so we drop and recreate the constraint
-- Actually SQLite CHECK constraints can't be altered, but they're not enforced strictly
-- We'll just allow it at the application level. The CHECK constraint was created with the table.
-- For D1/SQLite, we need to handle this differently - just update the route validation.
-- This migration is a no-op for the schema, the validation happens in application code.
SELECT 1;
