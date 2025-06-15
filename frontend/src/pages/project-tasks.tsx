import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle
} from '@/components/ui/dialog'
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select'
import { ArrowLeft, Plus, MoreHorizontal, Trash2, Edit } from 'lucide-react'
import { makeAuthenticatedRequest } from '@/lib/auth'
import { 
  KanbanProvider, 
  KanbanBoard, 
  KanbanHeader, 
  KanbanCards, 
  KanbanCard,
  type DragEndEvent 
} from '@/components/ui/shadcn-io/kanban'
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

interface Project {
  id: string
  name: string
  owner_id: string
  created_at: string
  updated_at: string
}

interface ApiResponse<T> {
  success: boolean
  data: T | null
  message: string | null
}



// All possible task statuses from shared types
const allTaskStatuses: TaskStatus[] = ['todo', 'inprogress', 'inreview', 'done', 'cancelled']

const statusLabels: Record<TaskStatus, string> = {
  todo: 'To Do',
  inprogress: 'In Progress',
  inreview: 'In Review',
  done: 'Done',
  cancelled: 'Cancelled'
}

const statusBoardColors: Record<TaskStatus, string> = {
  todo: '#64748b',
  inprogress: '#3b82f6',
  inreview: '#f59e0b',
  done: '#22c55e',
  cancelled: '#ef4444'
}

export function ProjectTasks() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const [tasks, setTasks] = useState<Task[]>([])
  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)

  // Form states
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskDescription, setNewTaskDescription] = useState('')
  const [editTaskTitle, setEditTaskTitle] = useState('')
  const [editTaskDescription, setEditTaskDescription] = useState('')
  const [editTaskStatus, setEditTaskStatus] = useState<Task['status']>('todo')

  useEffect(() => {
    if (projectId) {
      fetchProject()
      fetchTasks()
    }
  }, [projectId])

  const fetchProject = async () => {
    try {
      const response = await makeAuthenticatedRequest(`/api/projects/${projectId}`)
      
      if (response.ok) {
        const result: ApiResponse<Project> = await response.json()
        if (result.success && result.data) {
          setProject(result.data)
        }
      } else if (response.status === 404) {
        setError('Project not found')
        navigate('/projects')
      }
    } catch (err) {
      setError('Failed to load project')
    }
  }

  const fetchTasks = async () => {
    try {
      setLoading(true)
      const response = await makeAuthenticatedRequest(`/api/projects/${projectId}/tasks`)
      
      if (response.ok) {
        const result: ApiResponse<Task[]> = await response.json()
        if (result.success && result.data) {
          setTasks(result.data)
        }
      } else {
        setError('Failed to load tasks')
      }
    } catch (err) {
      setError('Failed to load tasks')
    } finally {
      setLoading(false)
    }
  }

  const createTask = async () => {
    if (!newTaskTitle.trim()) return

    try {
      const response = await makeAuthenticatedRequest(`/api/projects/${projectId}/tasks`, {
        method: 'POST',
        body: JSON.stringify({
          project_id: projectId,
          title: newTaskTitle,
          description: newTaskDescription || null
        })
      })

      if (response.ok) {
        await fetchTasks()
        setNewTaskTitle('')
        setNewTaskDescription('')
        setIsCreateDialogOpen(false)
      } else {
        setError('Failed to create task')
      }
    } catch (err) {
      setError('Failed to create task')
    }
  }

  const updateTask = async () => {
    if (!editingTask || !editTaskTitle.trim()) return

    try {
      const response = await makeAuthenticatedRequest(`/api/projects/${projectId}/tasks/${editingTask.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: editTaskTitle,
          description: editTaskDescription || null,
          status: editTaskStatus
        })
      })

      if (response.ok) {
        await fetchTasks()
        setEditingTask(null)
        setIsEditDialogOpen(false)
      } else {
        setError('Failed to update task')
      }
    } catch (err) {
      setError('Failed to update task')
    }
  }

  const deleteTask = async (taskId: string) => {
    if (!confirm('Are you sure you want to delete this task?')) return

    try {
      const response = await makeAuthenticatedRequest(`/api/projects/${projectId}/tasks/${taskId}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        await fetchTasks()
      } else {
        setError('Failed to delete task')
      }
    } catch (err) {
      setError('Failed to delete task')
    }
  }

  const openEditDialog = (task: Task) => {
    setEditingTask(task)
    setEditTaskTitle(task.title)
    setEditTaskDescription(task.description || '')
    setEditTaskStatus(task.status)
    setIsEditDialogOpen(true)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    
    if (!over || !active.data.current) return
    
    const taskId = active.id as string
    const newStatus = over.id as Task['status']
    const task = tasks.find(t => t.id === taskId)
    
    if (!task || task.status === newStatus) return

    // Optimistically update the UI immediately
    const previousStatus = task.status
    setTasks(prev => prev.map(t => 
      t.id === taskId ? { ...t, status: newStatus } : t
    ))

    try {
      const response = await makeAuthenticatedRequest(`/api/projects/${projectId}/tasks/${taskId}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: task.title,
          description: task.description,
          status: newStatus
        })
      })

      if (!response.ok) {
        // Revert the optimistic update if the API call failed
        setTasks(prev => prev.map(t => 
          t.id === taskId ? { ...t, status: previousStatus } : t
        ))
        setError('Failed to update task status')
      }
    } catch (err) {
      // Revert the optimistic update if the API call failed
      setTasks(prev => prev.map(t => 
        t.id === taskId ? { ...t, status: previousStatus } : t
      ))
      setError('Failed to update task status')
    }
  }

  const groupTasksByStatus = () => {
    const groups: Record<TaskStatus, Task[]> = {} as Record<TaskStatus, Task[]>
    
    // Initialize groups for all possible statuses
    allTaskStatuses.forEach(status => {
      groups[status] = []
    })
    
    tasks.forEach(task => {
      // Convert old capitalized status to lowercase if needed
      const normalizedStatus = task.status.toLowerCase() as TaskStatus
      if (groups[normalizedStatus]) {
        groups[normalizedStatus].push(task)
      } else {
        // Default to todo if status doesn't match any expected value
        groups['todo'].push(task)
      }
    })
    
    return groups
  }

  if (loading) {
    return <div className="text-center py-8">Loading tasks...</div>
  }

  if (error) {
    return <div className="text-center py-8 text-red-600">{error}</div>
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/projects')}
            className="flex items-center"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Projects
          </Button>
          <div>
            <h1 className="text-2xl font-bold">
              {project?.name || 'Project'} Tasks
            </h1>
            <p className="text-muted-foreground">
              Manage tasks for this project
            </p>
          </div>
        </div>
        
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Task
        </Button>
      </div>

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Task</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  placeholder="Enter task title"
                />
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={newTaskDescription}
                  onChange={(e) => setNewTaskDescription(e.target.value)}
                  placeholder="Enter task description (optional)"
                  rows={3}
                />
              </div>
              <div className="flex justify-end space-x-2">
                <Button
                  variant="outline"
                  onClick={() => setIsCreateDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button onClick={createTask}>Create Task</Button>
              </div>
            </div>
        </DialogContent>
      </Dialog>

      {/* Tasks View */}
      {tasks.length === 0 ? (
        <Card>
          <CardContent className="text-center py-8">
            <p className="text-muted-foreground">No tasks found for this project.</p>
            <Button
              className="mt-4"
              onClick={() => setIsCreateDialogOpen(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Create First Task
            </Button>
          </CardContent>
        </Card>
      ) : (
        <KanbanProvider onDragEnd={handleDragEnd}>
          {Object.entries(groupTasksByStatus()).map(([status, statusTasks]) => (
            <KanbanBoard key={status} id={status as Task['status']}>
              <KanbanHeader
                name={statusLabels[status as Task['status']]}
                color={statusBoardColors[status as Task['status']]}
              />
              <KanbanCards>
                {statusTasks.map((task, index) => (
                  <KanbanCard
                    key={task.id}
                    id={task.id}
                    name={task.title}
                    index={index}
                    parent={status}
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between">
                        <div 
                          className="flex-1 cursor-pointer pr-2" 
                          onClick={() => openEditDialog(task)}
                        >
                          <h4 className="font-medium text-sm">
                            {task.title}
                          </h4>
                        </div>
                        <div 
                          className="flex-shrink-0"
                          onPointerDown={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-8 w-8 p-0 hover:bg-gray-100"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEditDialog(task)}>
                                <Edit className="h-4 w-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={() => deleteTask(task.id)}
                                className="text-red-600"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                      {task.description && (
                        <div 
                          className="cursor-pointer" 
                          onClick={() => openEditDialog(task)}
                        >
                          <p className="text-xs text-muted-foreground">
                            {task.description}
                          </p>
                        </div>
                      )}
                    </div>
                  </KanbanCard>
                ))}
              </KanbanCards>
            </KanbanBoard>
          ))}
        </KanbanProvider>
      )}

      {/* Edit Task Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-title">Title</Label>
              <Input
                id="edit-title"
                value={editTaskTitle}
                onChange={(e) => setEditTaskTitle(e.target.value)}
                placeholder="Enter task title"
              />
            </div>
            <div>
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={editTaskDescription}
                onChange={(e) => setEditTaskDescription(e.target.value)}
                placeholder="Enter task description (optional)"
                rows={3}
              />
            </div>
            <div>
              <Label htmlFor="edit-status">Status</Label>
              <Select
                value={editTaskStatus}
                onValueChange={(value) => setEditTaskStatus(value as Task['status'])}
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
            <div className="flex justify-end space-x-2">
              <Button
                variant="outline"
                onClick={() => setIsEditDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button onClick={updateTask}>Update Task</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
