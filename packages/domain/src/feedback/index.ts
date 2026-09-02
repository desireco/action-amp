/** The feedback cores (S17) — see ./operationsCore.ts for the port notes.
 *  `submitFeedbackCore` (the user-facing write) is the S-review port; see
 *  ./submit.ts. */
export {
  deleteFeedbackCore,
  FEEDBACK_SELECT,
  FEEDBACK_STATUSES,
  isFeedbackStatus,
  listFeedbackCore,
  showFeedbackCore,
  updateFeedbackStatusCore,
  type FeedbackEntities,
  type FeedbackRow,
  type FeedbackSelect,
  type FeedbackStatus,
} from "./operationsCore.js";
export {
  submitFeedbackCore,
  type FeedbackSubmitEntities,
} from "./submit.js";
