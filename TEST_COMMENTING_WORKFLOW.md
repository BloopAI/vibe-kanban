# Test Plan for Diff Commenting Feature

## Overview
This document outlines the test plan for the diff commenting feature implemented in Vibe Kanban.

## Features Implemented

### Backend
1. **Database Schema**: Created `diff_comments` table with fields for tracking comments on diff lines
2. **API Endpoints**:
   - `POST /api/diff-comments` - Create a new comment
   - `GET /api/diff-comments/:id` - Get a single comment
   - `PATCH /api/diff-comments/:id` - Update a comment
   - `DELETE /api/diff-comments/:id` - Delete a comment
   - `GET /api/tasks/:task_id/attempts/:attempt_id/diff-comments` - List all comments for an attempt
   - `GET /api/tasks/:task_id/attempts/:attempt_id/diff-comments/draft` - List draft comments only
   - `POST /api/diff-comments/submit` - Submit draft comments for LLM review

### Frontend
1. **DiffCommentsContext**: React context for managing comment state
2. **Line Selection**: Modified DiffChunkSection to support selecting lines in the diff
3. **CommentInput**: Floating input component for adding comments
4. **CommentDisplay**: Component for displaying individual comments
5. **CommentsPanel**: Panel showing all comments with draft/submitted tabs
6. **Bulk Submit**: Feature to select and submit multiple draft comments

## Testing Steps

### 1. Line Selection
- Open a task with a diff view
- Click and drag to select lines in the diff
- Verify that selected lines are highlighted
- Verify that the CommentInput appears

### 2. Creating Comments
- Select lines in the diff
- Type a comment in the floating input
- Click "Add to Draft" or press Ctrl+Enter
- Verify the comment is created and appears in the comments panel

### 3. Comment Management
- Click "Show Comments" button to open the comments panel
- Verify draft comments appear in the "Drafts" tab
- Edit a draft comment and save changes
- Delete a draft comment

### 4. Bulk Submission
- Create multiple draft comments
- Select comments using checkboxes
- Click "Submit" button
- Review the prompt preview
- Confirm submission
- Verify comments move to "Submitted" tab

## Current Status

### Working Features
- Database schema and migrations
- Backend API routes (with some SQLx compilation issues)
- Frontend components and state management
- UI for selecting lines and adding comments
- Comment display and management UI

### Known Issues
1. SQLx compile-time query verification issues with DateTime types
2. Some import path issues resolved by using direct fetch instead of API client
3. Toast notifications temporarily disabled

## Next Steps
1. Fix SQLx compilation issues in backend
2. Add integration tests for the API endpoints
3. Add unit tests for frontend components
4. Improve error handling and user feedback
5. Add keyboard shortcuts for common actions