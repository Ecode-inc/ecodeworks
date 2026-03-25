-- Performance indexes for frequently queried columns

-- Documents: created_by and department+visibility combo
CREATE INDEX IF NOT EXISTS idx_documents_created_by ON documents(created_by);
CREATE INDEX IF NOT EXISTS idx_documents_dept_visibility ON documents(department_id, visibility);

-- Credentials: visibility and department
CREATE INDEX IF NOT EXISTS idx_credentials_visibility ON credentials(visibility);
CREATE INDEX IF NOT EXISTS idx_credentials_department_id ON credentials(department_id);

-- Attendance: department and user+date combo
CREATE INDEX IF NOT EXISTS idx_attendance_records_department_id ON attendance_records(department_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_user_date ON attendance_records(user_id, date);

-- Leave requests: approver and user+org combo
CREATE INDEX IF NOT EXISTS idx_leave_requests_approver1 ON leave_requests(approver1_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_user_org ON leave_requests(user_id, org_id);

-- Tasks: board+column combo
CREATE INDEX IF NOT EXISTS idx_tasks_board_column ON tasks(board_id, column_id);

-- Task assignees: user lookup
-- idx_task_assignees_user already exists in 0026, but IF NOT EXISTS makes this safe
CREATE INDEX IF NOT EXISTS idx_task_assignees_user ON task_assignees(user_id);

-- Events: department+date combo for calendar queries
CREATE INDEX IF NOT EXISTS idx_events_dept_date ON events(department_id, start_at);

-- Banking: org+active combo
CREATE INDEX IF NOT EXISTS idx_banking_connections_org ON banking_connections(org_id, is_active);
