-- GitHub Project番号を追加（正確なURLリンク生成用）
ALTER TABLE github_project_links ADD COLUMN github_project_number INTEGER;
