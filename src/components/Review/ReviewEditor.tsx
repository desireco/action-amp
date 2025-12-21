import * as React from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, Save, X, Edit2, Check } from "lucide-react"

interface ReviewEditorProps {
    reviewId: string
    initialContent: string  // Raw markdown for editing
    initialHtml: string     // Rendered HTML for display
    onSave: (reviewId: string, content: string) => Promise<void>
    className?: string
}

export function ReviewEditor({
    reviewId,
    initialContent,
    initialHtml,
    onSave,
    className
}: ReviewEditorProps) {
    const [isEditing, setIsEditing] = React.useState(false)
    const [content, setContent] = React.useState(initialContent)
    const [isSaving, setIsSaving] = React.useState(false)
    const [hasChanges, setHasChanges] = React.useState(false)
    const [showSuccess, setShowSuccess] = React.useState(false)
    const textareaRef = React.useRef<HTMLTextAreaElement>(null)

    // Reset form when initial values change
    React.useEffect(() => {
        setContent(initialContent)
        setHasChanges(false)
    }, [initialContent])

    // Auto-focus textarea when editing starts
    React.useEffect(() => {
        if (isEditing && textareaRef.current) {
            textareaRef.current.focus()
        }
    }, [isEditing])

    const handleStartEdit = () => {
        setIsEditing(true)
        setContent(initialContent)
        setHasChanges(false)
        setShowSuccess(false)
    }

    const handleCancel = () => {
        setIsEditing(false)
        setContent(initialContent)
        setHasChanges(false)
    }

    const handleSave = async () => {
        if (!hasChanges || isSaving) return

        setIsSaving(true)
        try {
            await onSave(reviewId, content.trim())
            setIsEditing(false)
            setHasChanges(false)

            // Show success notification
            setShowSuccess(true)
            setTimeout(() => setShowSuccess(false), 3000)
        } catch (error) {
            console.error("Failed to save review:", error)
            alert("Failed to save review. Please try again.")
        } finally {
            setIsSaving(false)
        }
    }

    const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newContent = e.target.value
        setContent(newContent)
        setHasChanges(newContent.trim() !== initialContent.trim())
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
            <div className={cn("relative", className)}>
                {/* Success notification */}
                {showSuccess && (
                    <div className="fixed top-4 right-4 z-50 animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="bg-green-500 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2">
                            <Check className="h-5 w-5" />
                            <span className="font-medium">Review saved successfully!</span>
                        </div>
                    </div>
                )}

                <div className="flex items-start justify-between gap-4 group">
                    <div
                        className={cn(
                            "flex-1 prose prose-invert max-w-none transition-opacity duration-200",
                            showSuccess && "animate-out fade-out-0 duration-150"
                        )}
                        dangerouslySetInnerHTML={{ __html: initialHtml }}
                    />
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleStartEdit}
                        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Edit review (E)"
                    >
                        <Edit2 className="h-4 w-4" />
                        <span className="sr-only">Edit review</span>
                    </Button>
                </div>
            </div>
        )
    }

    return (
        <div className={cn("space-y-4 animate-in fade-in duration-200", className)}>
            <div className="space-y-3">
                <Textarea
                    ref={textareaRef}
                    value={content}
                    onChange={handleContentChange}
                    onKeyDown={handleKeyDown}
                    placeholder="Write your review in Markdown..."
                    className="min-h-[400px] resize-y font-mono text-sm"
                    disabled={isSaving}
                />
            </div>

            <div className="flex items-center justify-between">
                <div className="text-xs text-muted-foreground space-x-2">
                    <span>Press <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs border">Esc</kbd> to cancel</span>
                    <span>•</span>
                    <span><kbd className="px-1.5 py-0.5 bg-muted rounded text-xs border">⌘+Enter</kbd> to save</span>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        onClick={handleCancel}
                        disabled={isSaving}
                        size="sm"
                    >
                        <X className="h-4 w-4 mr-2" />
                        Cancel
                    </Button>

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
                                Save Changes
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    )
}
