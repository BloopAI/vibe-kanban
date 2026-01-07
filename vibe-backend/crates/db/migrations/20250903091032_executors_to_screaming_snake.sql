-- Converts pascal/camel to SCREAMING_SNAKE
UPDATE task_attempts
SET executor = (
  WITH RECURSIVE
    x(s, i, out) AS (
      SELECT executor, 1, ''
      UNION ALL
      SELECT s, i+1,
             out ||
             CASE
               WHEN i = 1 THEN substr(s,1,1)
               WHEN (substr(s,i,1) BETWEEN 'A' AND 'Z') AND (
                      (substr(s,i-1,1) BETWEEN 'a' AND 'z') OR
                      (substr(s,i-1,1) BETWEEN '0' AND '9') OR
                      ((substr(s,i-1,1) BETWEEN 'A' AND 'Z')
                        AND i < length(s) AND substr(s,i+1,1) BETWEEN 'a' AND 'z')
                    )
                    THEN '_' || substr(s,i,1)
               ELSE substr(s,i,1)
             END
      FROM x
      WHERE i <= length(s)
    )
  SELECT UPPER(out) FROM x WHERE i = length(s) + 1
);
