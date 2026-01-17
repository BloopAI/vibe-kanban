-- Add DAG position fields to tasks table
-- These fields store the x/y position of tasks in the DAG visualization view
-- Positions are optional (NULL when not set or using auto-layout)

ALTER TABLE tasks ADD COLUMN dag_position_x REAL;
ALTER TABLE tasks ADD COLUMN dag_position_y REAL;
