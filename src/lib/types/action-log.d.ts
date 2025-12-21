export interface ActionLog {
  id: string;
  visionId: string;
  type: 'completed' | 'progress' | 'nextAction';
  content: string;
  timestamp: string;
  author: string;
}

export interface VisionAnalytics {
  last7Days: number;
  last30Days: number;
  last90Days: number;
  totalActions: number;
}