-- Task to Document links
CREATE TABLE IF NOT EXISTS task_document_links (
  task_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  PRIMARY KEY (task_id, document_id),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

-- Task to QA project links
CREATE TABLE IF NOT EXISTS task_qa_links (
  task_id TEXT NOT NULL,
  qa_link_id TEXT NOT NULL,
  PRIMARY KEY (task_id, qa_link_id),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (qa_link_id) REFERENCES qa_project_links(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_task_doc_links_task ON task_document_links(task_id);
CREATE INDEX IF NOT EXISTS idx_task_qa_links_task ON task_qa_links(task_id);
