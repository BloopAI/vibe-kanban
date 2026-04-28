WITH default_tags(name, color) AS (
    VALUES
        ('bug', '355 65% 53%'),
        ('feature', '124 82% 30%'),
        ('documentation', '205 100% 40%'),
        ('enhancement', '181 72% 78%')
)
INSERT INTO local_tags (id, project_id, name, color)
SELECT randomblob(16), p.id, d.name, d.color
FROM projects p
CROSS JOIN default_tags d
WHERE NOT EXISTS (
    SELECT 1
    FROM local_tags t
    WHERE t.project_id = p.id
      AND t.name = d.name
);
