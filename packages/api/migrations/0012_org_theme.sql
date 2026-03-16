ALTER TABLE organizations ADD COLUMN sidebar_theme TEXT DEFAULT 'dark';
-- sidebar_theme: 'dark', 'light', 'custom'
ALTER TABLE organizations ADD COLUMN sidebar_color TEXT DEFAULT '#111827';
-- sidebar_color: hex color for custom theme
