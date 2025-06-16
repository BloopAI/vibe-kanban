import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Folder, FolderOpen, File, AlertCircle, Home, ChevronUp } from 'lucide-react'
import { makeAuthenticatedRequest } from '@/lib/auth'
import { DirectoryEntry } from 'shared/types'

interface FolderPickerProps {
  open: boolean
  onClose: () => void
  onSelect: (path: string) => void
  value?: string
  title?: string
  description?: string
}

export function FolderPicker({ 
  open, 
  onClose, 
  onSelect, 
  value = '', 
  title = 'Select Folder',
  description = 'Choose a folder for your project'
}: FolderPickerProps) {
  const [currentPath, setCurrentPath] = useState<string>('')
  const [entries, setEntries] = useState<DirectoryEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [manualPath, setManualPath] = useState(value)

  useEffect(() => {
    if (open) {
      setManualPath(value)
      loadDirectory()
    }
  }, [open, value])

  const loadDirectory = async (path?: string) => {
    setLoading(true)
    setError('')
    
    try {
      const queryParam = path ? `?path=${encodeURIComponent(path)}` : ''
      const response = await makeAuthenticatedRequest(`/api/filesystem/list${queryParam}`)
      
      if (!response.ok) {
        throw new Error('Failed to load directory')
      }
      
      const data = await response.json()
      
      if (data.success) {
        setEntries(data.data || [])
        setCurrentPath(path || data.message || '')
      } else {
        setError(data.message || 'Failed to load directory')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load directory')
    } finally {
      setLoading(false)
    }
  }

  const handleFolderClick = (entry: DirectoryEntry) => {
    if (entry.is_directory) {
      loadDirectory(entry.path)
    }
  }

  const handleParentDirectory = () => {
    const parentPath = currentPath.split('/').slice(0, -1).join('/')
    loadDirectory(parentPath || '/')
  }

  const handleHomeDirectory = () => {
    loadDirectory()
  }

  const handleManualPathChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setManualPath(e.target.value)
  }

  const handleManualPathSubmit = () => {
    loadDirectory(manualPath)
  }

  const handleSelectCurrent = () => {
    onSelect(currentPath)
    onClose()
  }

  const handleSelectManual = () => {
    onSelect(manualPath)
    onClose()
  }

  const handleClose = () => {
    setError('')
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] h-[500px] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 flex flex-col space-y-4 overflow-hidden">
          {/* Manual path input */}
          <div className="space-y-2">
            <div className="text-sm font-medium">Enter path manually:</div>
            <div className="flex space-x-2">
              <Input
                value={manualPath}
                onChange={handleManualPathChange}
                placeholder="/path/to/your/project"
                className="flex-1"
              />
              <Button 
                onClick={handleManualPathSubmit}
                variant="outline"
                size="sm"
              >
                Go
              </Button>
            </div>
          </div>

          {/* Navigation */}
          <div className="flex items-center space-x-2">
            <Button
              onClick={handleHomeDirectory}
              variant="outline"
              size="sm"
            >
              <Home className="h-4 w-4" />
            </Button>
            <Button
              onClick={handleParentDirectory}
              variant="outline"
              size="sm"
              disabled={!currentPath || currentPath === '/'}
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
            <div className="text-sm text-muted-foreground flex-1">
              {currentPath || 'Home'}
            </div>
            <Button
              onClick={handleSelectCurrent}
              variant="outline"
              size="sm"
              disabled={!currentPath}
            >
              Select Current
            </Button>
          </div>

          {/* Directory listing */}
          <div className="flex-1 border rounded-md overflow-auto">
            {loading ? (
              <div className="p-4 text-center text-muted-foreground">
                Loading...
              </div>
            ) : error ? (
              <Alert variant="destructive" className="m-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : entries.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground">
                No folders found
              </div>
            ) : (
              <div className="p-2">
                {entries.map((entry, index) => (
                  <div
                    key={index}
                    className={`flex items-center space-x-2 p-2 rounded cursor-pointer hover:bg-accent ${
                      !entry.is_directory ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                    onClick={() => entry.is_directory && handleFolderClick(entry)}
                  >
                    {entry.is_directory ? (
                      entry.is_git_repo ? (
                        <FolderOpen className="h-4 w-4 text-green-600" />
                      ) : (
                        <Folder className="h-4 w-4 text-blue-600" />
                      )
                    ) : (
                      <File className="h-4 w-4 text-gray-400" />
                    )}
                    <span className="text-sm flex-1">{entry.name}</span>
                    {entry.is_git_repo && (
                      <span className="text-xs text-green-600 bg-green-100 px-2 py-1 rounded">
                        git repo
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSelectManual}
            disabled={!manualPath.trim()}
          >
            Select Path
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
