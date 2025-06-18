import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { FileSearchTextarea } from '@/components/ui/file-search-textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import type { TaskStatus } from 'shared/types'

interface Task {
  id: string
  project_id: string
  title: string
  description: string | null
  status: TaskStatus
  created_at: string
  updated_at: string
}

interface TaskFormDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  task?: Task | null // Optional for create mode
  projectId?: string // For file search functionality
  onCreateTask?: (title: string, description: string) => Promise<void>
  onUpdateTask?: (title: string, description: string, status: TaskStatus) => Promise<void>
}

export function TaskFormDialog({ 
  isOpen, 
  onOpenChange, 
  task, 
  projectId,
  onCreateTask, 
  onUpdateTask 
}: TaskFormDialogProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<TaskStatus>('todo')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isEditMode = Boolean(task)

  useEffect(() => {
    if (task) {
      // Edit mode - populate with existing task data
      setTitle(task.title)
      setDescription(task.description || '')
      setStatus(task.status)
    } else {
      // Create mode - reset to defaults
      setTitle('')
      setDescription('')
      setStatus('todo')
    }
  }, [task, isOpen])

  const handleSubmit = async () => {
    if (!title.trim()) return
    
    setIsSubmitting(true)
    try {
      if (isEditMode && onUpdateTask) {
        await onUpdateTask(title, description, status)
      } else if (!isEditMode && onCreateTask) {
        await onCreateTask(title, description)
      }
      
      // Reset form on successful creation
      if (!isEditMode) {
        setTitle('')
        setDescription('')
        setStatus('todo')
      }
      
      onOpenChange(false)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCancel = () => {
    // Reset form state when canceling
    if (task) {
      setTitle(task.title)
      setDescription(task.description || '')
      setStatus(task.status)
    } else {
      setTitle('')
      setDescription('')
      setStatus('todo')
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditMode ? 'Edit Task' : 'Create New Task'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="task-title">Title</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter task title"
              disabled={isSubmitting}
            />
          </div>
          
          <div>
            <Label htmlFor="task-description">Description</Label>
            <FileSearchTextarea
              value={description}
              onChange={setDescription}
              placeholder="Enter task description (optional). Type @ to search files."
              rows={3}
              disabled={isSubmitting}
              projectId={projectId}
            />
          </div>
          
          {isEditMode && (
            <div>
              <Label htmlFor="task-status">Status</Label>
              <Select
                value={status}
                onValueChange={(value) => setStatus(value as TaskStatus)}
                disabled={isSubmitting}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todo">To Do</SelectItem>
                  <SelectItem value="inprogress">In Progress</SelectItem>
                  <SelectItem value="inreview">In Review</SelectItem>
                  <SelectItem value="done">Done</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          
          <div className="flex justify-end space-x-2">
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={isSubmitting || !title.trim()}
            >
              {isSubmitting 
                ? (isEditMode ? 'Updating...' : 'Creating...') 
                : (isEditMode ? 'Update Task' : 'Create Task')
              }
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
