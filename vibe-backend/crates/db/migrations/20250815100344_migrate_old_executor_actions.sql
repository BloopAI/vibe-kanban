-- JSON format changed, means you can access logs from old execution_processes

UPDATE execution_processes
SET executor_action = json_set(
  json_remove(executor_action, '$.typ.profile'),
  '$.typ.profile_variant_label',
  json_object(
    'profile', json_extract(executor_action, '$.typ.profile'),
    'variant', json('null')
  )
)
WHERE json_type(executor_action, '$.typ') IS NOT NULL
  AND json_type(executor_action, '$.typ.profile') = 'text';