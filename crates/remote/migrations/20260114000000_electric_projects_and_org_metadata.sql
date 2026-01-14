-- Grant electric_sync access to projects and organization_member_metadata tables
SELECT electric_sync_table('public', 'projects');
SELECT electric_sync_table('public', 'organization_member_metadata');
