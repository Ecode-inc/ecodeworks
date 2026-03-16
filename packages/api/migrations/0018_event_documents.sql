CREATE TABLE IF NOT EXISTS event_documents (
  event_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  PRIMARY KEY (event_id, document_id),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_event_documents_event ON event_documents(event_id);
CREATE INDEX IF NOT EXISTS idx_event_documents_doc ON event_documents(document_id);
