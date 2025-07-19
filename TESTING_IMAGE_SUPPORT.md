# Testing Image Support in Vibe Kanban

This document describes how to test the new image input support feature.

## What's New

Vibe Kanban now supports attaching images to tasks that will be sent to Claude Code and other AI coding agents.

### Backend Changes

1. **Database**: Added `task_attachments` table to store uploaded images
2. **API**: Updated task creation endpoints to accept base64-encoded image attachments
3. **Executors**: Modified Claude executor to save images as temporary files and include their paths in prompts

### Frontend Changes

1. **Image Upload Component**: New drag-and-drop image upload UI
2. **Task Form**: Integrated image upload with support for:
   - Drag and drop multiple images
   - Click to browse and select images
   - Paste images with Ctrl+V / Cmd+V
   - Preview uploaded images
   - Remove individual images

## How to Test

1. **Build the Project**:
   ```bash
   pnpm build
   ```

2. **Run the Application**:
   ```bash
   pnpm dev
   ```

3. **Create a Task with Images**:
   - Open a project
   - Click "New Task" 
   - Fill in title and description
   - In the "Images" section, try:
     - Dragging and dropping image files
     - Clicking "Choose Images" to browse
     - Taking a screenshot and pasting with Ctrl+V
   - Click "Create & Start"

4. **Verify Image Handling**:
   - The images should be saved as attachments
   - When Claude Code executes, it should receive the image file paths in the prompt
   - The executor will save images to temporary files before passing to Claude

## Technical Details

- Images are converted to base64 for transport between frontend and backend
- Backend saves images to SQLite database
- When executing, images are written to temp files and paths are included in the prompt
- Maximum 5 images per task, 10MB each

## Limitations

- Only image files are supported (no other attachment types yet)
- Images are stored in the database, which may increase database size
- Claude Code needs to support reading images from file paths (check their documentation)

## Future Improvements

- Support for other file types
- Image compression before storage
- CDN/external storage for large files
- Display attachments in task details view