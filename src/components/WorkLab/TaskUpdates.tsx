import * as React from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { MessageSquare, Send, Clock } from "lucide-react"
import { cn } from "@/lib/utils"

interface TaskUpdate {
  id: string
  content: string
  timestamp: Date
  author?: string
}

interface TaskUpdatesProps {
  taskId: string
  updates?: TaskUpdate[]
  onPostUpdate: (taskId: string, content: string) => Promise<void>
  className?: string
  disabled?: boolean
  placeholder?: string
}

export function TaskUpdates({
  taskId,
  updates = [],
  onPostUpdate,
  className,
  disabled = false,
  placeholder = "Add an update or note about your progress..."
}: TaskUpdatesProps) {
  const [updateText, setUpdateText] = React.useState("")
  const [isPosting, setIsPosting] = React.useState(false)
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)

  const handlePostUpdate = async () => {
    if (!updateText.trim() || isPosting || disabled) return

    setIsPosting(true)
    try {
      await onPostUpdate(taskId, updateText.trim())
      setUpdateText("")
      // Focus back to textarea after posting
      if (textareaRef.current) {
        textareaRef.current.focus()
      }
    } catch (error) {
      console.error("Failed to post update:", error)
      // Could add error toast here
    } finally {
      setIsPosting(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handlePostUpdate()
    }
  }

  const formatDate = (date: Date) => {
    const now = new Date()
    const diffInMs = now.getTime() - date.getTime()
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60))
    const diffInDays = Math.floor(diffInHours / 24)

    // For today's updates, show the time in format like "10:35AM"
    if (diffInHours < 24) {
      // Format: 10:35AM Thu 12/4
      const hours = date.getHours()
      const minutes = date.getMinutes()
      const ampm = hours >= 12 ? 'PM' : 'AM'
      const displayHours = hours % 12 || 12
      const displayMinutes = minutes.toString().padStart(2, '0')
      const timeStr = `${displayHours}:${displayMinutes}${ampm}`

      // Get day of week and month/date
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      const dayName = days[date.getDay()]
      const month = date.getMonth() + 1
      const day = date.getDate()

      return `${timeStr} ${dayName} ${month}/${day}`
    } else if (diffInDays < 7) {
      return `${diffInDays}d ago`
    } else {
      return date.toLocaleDateString()
    }
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Update Input */}
      <div className="space-y-3">
        <div className="flex gap-3">
          <Textarea
            ref={textareaRef}
            value={updateText}
            onChange={(e) => setUpdateText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled || isPosting}
            rows={3}
            className="resize-none min-h-[80px]"
          />
        </div>
        <div className="flex justify-between items-center">
          <p className="text-xs text-muted-foreground">
            Press {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+Enter to post
          </p>
          <Button
            onClick={handlePostUpdate}
            disabled={!updateText.trim() || disabled || isPosting}
            size="sm"
            className="min-w-[100px]"
          >
            {isPosting ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Posting...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Post Update
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Updates History */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground border-t pt-4">
          <MessageSquare className="h-4 w-4" />
          Updates ({updates.length})
        </div>

        {updates.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No updates yet</p>
            <p className="text-xs">Add your first update above</p>
          </div>
        ) : (
          <div className="space-y-3">
            {updates.map((update) => (
              <div
                key={update.id}
                className="bg-muted/30 rounded-lg p-3 border border-border/50"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>{formatDate(update.timestamp)}</span>
                    {update.author && (
                      <>
                        <span>•</span>
                        <span>{update.author}</span>
                      </>
                    )}
                  </div>
                </div>
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                  {update.content}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}