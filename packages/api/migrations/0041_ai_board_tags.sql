-- Add tags column to ai_board_posts (JSON array of strings)
ALTER TABLE ai_board_posts ADD COLUMN tags TEXT DEFAULT '[]';
