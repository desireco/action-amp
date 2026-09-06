import type { ReviewCadence } from "./period";

export type ReviewAnswers = {
  howGoing?: string;
  goingWell?: string;
  challenges?: string;
  currentAttention?: string;
  memory?: string;
  moved?: string;
  change?: string;
  proud?: string;
  learned?: string;
  attention?: string;
  emphasisGoalId?: string;
};

export type ReviewLensRef = {
  id: string;
  name: string;
  color: string | null;
};

export type ReviewGoalRef = {
  id: string;
  name: string;
  permalink?: string;
};

export type ReviewProjectRef = {
  id: string;
  name: string;
  permalink?: string;
  goal?: ReviewGoalRef | null;
};

export type ReviewTaskItem = {
  id: string;
  title: string;
  permalink: string;
  outcome: string | null;
  size?: "S" | "M" | "L" | "XL";
  completedAt: string;
  lens: ReviewLensRef;
  project: ReviewProjectRef | null;
  goal: ReviewGoalRef | null;
};

export type ReviewProjectItem = {
  id: string;
  name: string;
  permalink: string;
  description: string | null;
  completedAt: string;
  lens: ReviewLensRef;
  goal: ReviewGoalRef | null;
};

export type ReviewGoalItem = {
  id: string;
  name: string;
  permalink: string;
  description: string | null;
  completedAt: string;
  lens: ReviewLensRef;
};

export type ReviewGoalOption = {
  id: string;
  name: string;
  permalink: string;
  lens: ReviewLensRef;
  isDone: boolean;
};

export type ReviewSnapshot = {
  version: 1;
  capturedAt: string;
  tasks: ReviewTaskItem[];
  projects: ReviewProjectItem[];
  goals: ReviewGoalItem[];
  focusMinutes: number;
  focusMinutesByLens?: Record<string, number>;
  weeklySlices: { startDate: string; completedTasks: number }[];
};

export type ReviewResult = {
  cadence: ReviewCadence;
  period: {
    start: string;
    end: string;
    startDate: string;
    endDate: string;
    label: string;
    inProgress: boolean;
  };
  answers: ReviewAnswers;
  completedAt: string | null;
  updatedAt: string | null;
  evidence: ReviewSnapshot;
  evidenceSource: "live" | "snapshot";
  newCompletionCount: number;
  availableGoals: ReviewGoalOption[];
};
