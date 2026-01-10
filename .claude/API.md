# iKanban API Reference

Backend API endpoints at `https://api.scho1ar.com` (prod) or `http://localhost:3001` (dev).

## Authentication

All endpoints require Clerk JWT in Authorization header:
```
Authorization: Bearer <clerk_jwt_token>
```

## Core Endpoints

### Workspaces
```
GET    /api/workspaces              # List user's workspaces
POST   /api/workspaces              # Create workspace
GET    /api/workspaces/:id          # Get workspace
PUT    /api/workspaces/:id          # Update workspace
DELETE /api/workspaces/:id          # Delete workspace
```

### Projects
```
GET    /api/workspaces/:id/projects      # List projects
POST   /api/workspaces/:id/projects      # Create project
GET    /api/projects/:id                 # Get project
PUT    /api/projects/:id                 # Update project
DELETE /api/projects/:id                 # Delete project
```

### Tasks/Issues
```
GET    /api/projects/:id/tasks           # List tasks
POST   /api/projects/:id/tasks           # Create task
GET    /api/tasks/:id                    # Get task
PUT    /api/tasks/:id                    # Update task
DELETE /api/tasks/:id                    # Delete task
PATCH  /api/tasks/:id/status             # Update status only
```

### Comments
```
GET    /api/tasks/:id/comments           # List comments
POST   /api/tasks/:id/comments           # Add comment
DELETE /api/comments/:id                 # Delete comment
```

### File Uploads
```
POST   /api/upload                       # Upload file to Supabase Storage
GET    /api/files/:id                    # Get file metadata
DELETE /api/files/:id                    # Delete file
```

### Users & Teams
```
GET    /api/users/me                     # Current user profile
GET    /api/workspaces/:id/members       # List workspace members
POST   /api/workspaces/:id/invite        # Invite member
DELETE /api/workspaces/:id/members/:uid  # Remove member
```

## Request/Response Examples

### Create Task
```bash
curl -X POST https://api.scho1ar.com/api/projects/abc123/tasks \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Fix login bug",
    "description": "Users cannot login on mobile",
    "status": "todo",
    "priority": 1
  }'
```

Response:
```json
{
  "id": "task_xyz789",
  "title": "Fix login bug",
  "status": "todo",
  "priority": 1,
  "created_at": "2024-01-10T10:00:00Z"
}
```

### Update Task Status
```bash
curl -X PATCH https://api.scho1ar.com/api/tasks/task_xyz789/status \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "inprogress"}'
```

## Status Values
```
todo        # Not started
inprogress  # Being worked on
review      # In review
done        # Completed
blocked     # Blocked by something
```

## Priority Values
```
1  # Critical
2  # High
3  # Medium
4  # Low
```

## Error Responses
```json
{
  "error": "Not found",
  "code": "NOT_FOUND",
  "status": 404
}
```

Common error codes:
- 400: Bad request (validation error)
- 401: Unauthorized (invalid/missing token)
- 403: Forbidden (no permission)
- 404: Not found
- 429: Rate limited
- 500: Internal server error
