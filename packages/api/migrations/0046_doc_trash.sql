-- Add soft-delete support for documents (trash/recycle bin)
ALTER TABLE documents ADD COLUMN deleted_at TEXT DEFAULT NULL;

-- Index for efficient trash queries
CREATE INDEX IF NOT EXISTS idx_documents_deleted_at ON documents(deleted_at);
