import * as React from "react"
import { Button } from "@/components/ui/button"
import { CheckCircle2, AlertCircle, Circle, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface StatusControlsProps {
  taskId: string
  currentStatus: 'todo' | 'in_progress' | 'blocked' | 'completed'
  onStatusChange: (taskId: string, newStatus: 'todo' | 'in_progress' | 'blocked' | 'completed') => Promise<void>
  className?: string
  disabled?: boolean
}

export function StatusControls({
  taskId,
  currentStatus,
  onStatusChange,
  className,
  disabled = false
}: StatusControlsProps) {
  const [isUpdating, setIsUpdating] = React.useState(false)

  // Add keyboard shortcuts
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Only trigger when not focused on an input/textarea
      if (document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
        return
      }

      // Check for modifier keys (Cmd/Ctrl + key)
      const modifierPressed = event.metaKey || event.ctrlKey

      if (modifierPressed) {
        switch (event.key.toLowerCase()) {
          case 'c':
            event.preventDefault()
            handleStatusChange('completed')
            break
          case 'b':
            event.preventDefault()
            handleStatusChange('blocked')
            break
          case 'n':
            event.preventDefault()
            handleStatusChange('todo')
            break
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentStatus, isUpdating, disabled])

  const handleStatusChange = async (newStatus: 'todo' | 'in_progress' | 'blocked' | 'completed') => {
    if (newStatus === currentStatus || isUpdating || disabled) return

    setIsUpdating(true)
    try {
      await onStatusChange(taskId, newStatus)
    } catch (error) {
      console.error("Failed to update status:", error)
      // Could add error toast here
    } finally {
      setIsUpdating(false)
    }
  }

  const statusButtons = [
    {
      status: 'completed' as const,
      label: 'Completed',
      icon: CheckCircle2,
      variant: currentStatus === 'completed' ? 'default' : 'outline',
      description: 'Mark as completed (⌘C)',
      className: currentStatus === 'completed'
        ? 'bg-green-600 hover:bg-green-700 border-green-600'
        : 'hover:bg-green-50 hover:border-green-200 hover:text-green-700'
    },
    {
      status: 'blocked' as const,
      label: 'Blocked',
      icon: AlertCircle,
      variant: currentStatus === 'blocked' ? 'default' : 'outline',
      description: 'Mark as blocked (⌘B)',
      className: currentStatus === 'blocked'
        ? 'bg-red-600 hover:bg-red-700 border-red-600'
        : 'hover:bg-red-50 hover:border-red-200 hover:text-red-700'
    },
    {
      status: 'todo' as const,
      label: 'Not Started',
      icon: Circle,
      variant: currentStatus === 'todo' ? 'default' : 'outline',
      description: 'Mark as not started (⌘N)',
      className: currentStatus === 'todo'
        ? 'bg-gray-600 hover:bg-gray-700 border-gray-600'
        : 'hover:bg-gray-50 hover:border-gray-200 hover:text-gray-700'
    }
  ]

  return (
    <div className={cn("flex flex-col sm:flex-row gap-2", className)}>
      {statusButtons.map(({ status, label, icon: Icon, variant, description, className: buttonClassName }) => (
        <Button
          key={status}
          variant={variant}
          size="sm"
          onClick={() => handleStatusChange(status)}
          disabled={disabled || isUpdating || status === currentStatus}
          className={cn(
            "flex items-center gap-2 min-w-[120px] justify-center",
            buttonClassName
          )}
          title={description}
        >
          {isUpdating && status === currentStatus ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Icon className="h-4 w-4" />
          )}
          <span>{label}</span>
        </Button>
      ))}
    </div>
  )
}