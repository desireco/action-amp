import * as React from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, Save, X, Edit2 } from "lucide-react"

interface TaskEditorProps {
  taskId: string
  initialTitle: string
  initialContent: string
  onSave: (taskId: string, title: string, content: string) => Promise<void>
  className?: string
}

export function TaskEditor({
  taskId,
  initialTitle,
  initialContent,
  onSave,
  className
}: TaskEditorProps) {
  const [isEditing, setIsEditing] = React.useState(false)
  const [title, setTitle] = React.useState(initialTitle)
  const [content, setContent] = React.useState(initialContent)
  const [isSaving, setIsSaving] = React.useState(false)
  const [hasChanges, setHasChanges] = React.useState(false)

  // Reset form when initial values change
  React.useEffect(() => {
    setTitle(initialTitle)
    setContent(initialContent)
    setHasChanges(false)
  }, [initialTitle, initialContent])

  const handleStartEdit = () => {
    setIsEditing(true)
    setTitle(initialTitle)
    setContent(initialContent)
    setHasChanges(false)
  }

  const handleCancel = () => {
    setIsEditing(false)
    setTitle(initialTitle)
    setContent(initialContent)
    setHasChanges(false)
  }

  const handleSave = async () => {
    if (!hasChanges || isSaving) return

    setIsSaving(true)
    try {
      await onSave(taskId, title.trim(), content.trim())
      setIsEditing(false)
      setHasChanges(false)
    } catch (error) {
      console.error("Failed to save task:", error)
      // Could add error toast here
    } finally {
      setIsSaving(false)
    }
  }

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value
    setTitle(newTitle)
    setHasChanges(newTitle.trim() !== initialTitle.trim() || content.trim() !== initialContent.trim())
  }

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value
    setContent(newContent)
    setHasChanges(title.trim() !== initialTitle.trim() || newContent.trim() !== initialContent.trim())
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      handleCancel()
    } else if (e.key === "Enter" && e.metaKey) {
      e.preventDefault()
      handleSave()
    }
  }

  if (!isEditing) {
    return (
      <div className={cn("space-y-4", className)}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-2">
            <h2 className="text-xl font-semibold text-foreground">{initialTitle}</h2>
            {initialContent && (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {initialContent}
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleStartEdit}
            className="shrink-0"
          >
            <Edit2 className="h-4 w-4" />
            <span className="sr-only">Edit task</span>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className={cn("space-y-4", className)}>
      <div className="space-y-3">
        <Input
          value={title}
          onChange={handleTitleChange}
          onKeyDown={handleKeyDown}
          placeholder="Task title..."
          className="text-lg font-semibold"
          disabled={isSaving}
        />
        <Textarea
          value={content}
          onChange={handleContentChange}
          onKeyDown={handleKeyDown}
          placeholder="Task description or notes..."
          className="min-h-[100px] resize-y"
          disabled={isSaving}
        />
      </div>

      <div className="flex items-center gap-2">
        <Button
          onClick={handleSave}
          disabled={!hasChanges || isSaving}
          size="sm"
        >
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Save
            </>
          )}
        </Button>

        <Button
          variant="outline"
          onClick={handleCancel}
          disabled={isSaving}
          size="sm"
        >
          <X className="h-4 w-4 mr-2" />
          Cancel
        </Button>
      </div>

      <div className="text-xs text-muted-foreground">
        Press <kbd className="px-1 py-0.5 bg-muted rounded text-xs">Esc</kbd> to cancel,
        <kbd className="px-1 py-0.5 bg-muted rounded text-xs ml-1">⌘+Enter</kbd> to save
      </div>
    </div>
  )
}