import { Navigate, useNavigate } from "react-router";
import { useQuery } from "wasp/client/operations";
import {
  getFocusedTask,
  addTaskUpdate,
  updateTaskContent,
  completeTaskFromFocus,
} from "wasp/client/operations";
import { useQueryClient } from "@tanstack/react-query";
import { FocusMode } from "../components/ui";
import { toFocusTask } from "./focusTaskView";
import "./NextPage.css";

/**
 * Dedicated focus route. Focus is a mode, not an address for a specific task:
 * the server exposes the user's single started task and this page renders it.
 */
export function FocusPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: task, isLoading } = useQuery(getFocusedTask);

  const refreshTaskState = () => {
    queryClient.invalidateQueries({ queryKey: ["getFocusedTask"] });
    queryClient.invalidateQueries({ queryKey: ["getTask"] });
    queryClient.invalidateQueries({ queryKey: ["getTopTask"] });
    queryClient.invalidateQueries({ queryKey: ["getTasks"] });
    queryClient.invalidateQueries({ queryKey: ["getDoneToday"] });
    queryClient.invalidateQueries({ queryKey: ["getLogbook"] });
    queryClient.invalidateQueries({ queryKey: ["getAppData"] });
  };

  if (isLoading) {
    return (
      <div className="aa-wn">
        <div className="aa-wn-eyebrow">Focus</div>
        <h1 className="aa-wn-empty">...</h1>
      </div>
    );
  }

  if (!task) {
    return <Navigate to="/app" replace />;
  }

  return (
    <FocusMode
      task={toFocusTask(task)}
      onClose={() => navigate("/app")}
      onComplete={async () => {
        await completeTaskFromFocus({ taskId: task.id });
        refreshTaskState();
        navigate("/app");
      }}
      onAddNote={async (body) => {
        await addTaskUpdate({ taskId: task.id, body });
        queryClient.invalidateQueries({ queryKey: ["getFocusedTask"] });
      }}
      onSaveContent={async (content) => {
        await updateTaskContent({ taskId: task.id, content });
        queryClient.invalidateQueries({ queryKey: ["getFocusedTask"] });
      }}
    />
  );
}
