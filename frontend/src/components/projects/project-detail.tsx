import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Project, ApiResponse } from 'shared/types'
import { ProjectForm } from './project-form'
import { ArrowLeft, Edit, Trash2, Calendar, Clock, User, AlertCircle, Loader2, CheckSquare, GitBranch, ExternalLink } from 'lucide-react'

interface ProjectDetailProps {
  projectId: string
  onBack: () => void
}

export function ProjectDetail({ projectId, onBack }: ProjectDetailProps) {
  const navigate = useNavigate()
  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(false)
  const [showEditForm, setShowEditForm] = useState(false)
  const [error, setError] = useState('')

  const fetchProject = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/projects/${projectId}`)
      const data: ApiResponse<Project> = await response.json()
      if (data.success && data.data) {
        setProject(data.data)
      } else {
        setError('Project not found')
      }
    } catch (error) {
      console.error('Failed to fetch project:', error)
      setError('Failed to load project')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!project) return
    if (!confirm(`Are you sure you want to delete "${project.name}"? This action cannot be undone.`)) return

    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: 'DELETE',
      })
      if (response.ok) {
        onBack()
      }
    } catch (error) {
      console.error('Failed to delete project:', error)
      setError('Failed to delete project')
    }
  }

  const handleEditSuccess = () => {
    setShowEditForm(false)
    fetchProject()
  }

  useEffect(() => {
    fetchProject()
  }, [projectId])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading project...
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className="space-y-4">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Projects
        </Button>
        <Card>
          <CardContent className="py-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
              <AlertCircle className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">Project not found</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {error || 'The project you\'re looking for doesn\'t exist or has been deleted.'}
            </p>
            <Button className="mt-4" onClick={onBack}>
              Back to Projects
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div className="flex items-center space-x-4">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Projects
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{project.name}</h1>
            <p className="text-sm text-muted-foreground">Project details and settings</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => navigate(`/projects/${projectId}/tasks`)}>
            <CheckSquare className="mr-2 h-4 w-4" />
            View Tasks
          </Button>
          <Button variant="outline" onClick={() => setShowEditForm(true)}>
            <Edit className="mr-2 h-4 w-4" />
            Edit
          </Button>
          <Button 
            variant="outline" 
            onClick={handleDelete}
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Calendar className="mr-2 h-5 w-5" />
              Project Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">Status</span>
              <Badge variant="secondary">Active</Badge>
            </div>
            <div className="space-y-2">
              <div className="flex items-center text-sm">
                <Calendar className="mr-2 h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Created:</span>
                <span className="ml-2">{new Date(project.created_at).toLocaleDateString()}</span>
              </div>
              <div className="flex items-center text-sm">
                <Clock className="mr-2 h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Last Updated:</span>
                <span className="ml-2">{new Date(project.updated_at).toLocaleDateString()}</span>
              </div>
              <div className="flex items-center text-sm">
                <User className="mr-2 h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Owner ID:</span>
                <code className="ml-2 text-xs bg-muted px-1 py-0.5 rounded">
                  {project.owner_id.substring(0, 8)}...
                </code>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <GitBranch className="mr-2 h-5 w-5" />
              Repository Information
            </CardTitle>
            <CardDescription>
              Git repository details and connection
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="text-sm font-medium text-muted-foreground">Repository URL</h4>
              <div className="mt-1 flex items-center space-x-2">
                <code className="flex-1 text-xs bg-muted p-2 rounded font-mono">
                  {project.repo_url}
                </code>
                <a 
                  href={project.repo_url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-primary"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            </div>
            <div>
              <h4 className="text-sm font-medium text-muted-foreground">Git Provider</h4>
              <div className="mt-1">
                <Badge variant="outline" className="capitalize">
                  {project.repo_provider}
                </Badge>
              </div>
            </div>
            <div>
              <h4 className="text-sm font-medium text-muted-foreground">Project ID</h4>
              <code className="mt-1 block text-xs bg-muted p-2 rounded font-mono">
                {project.id}
              </code>
            </div>
          </CardContent>
        </Card>
      </div>

      <ProjectForm
        open={showEditForm}
        onClose={() => setShowEditForm(false)}
        onSuccess={handleEditSuccess}
        project={project}
      />
    </div>
  )
}
