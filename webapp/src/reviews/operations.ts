import type {
  CompleteReview,
  GetReview,
  SaveReviewDraft,
} from "wasp/server/operations";
import {
  completeReviewData,
  getReviewData,
  saveReviewDraftData,
  type ReviewArgs,
  type SaveReviewArgs,
} from "./operationsCore";
import type { ReviewResult } from "./types";

export const getReview = (async (args, context) => {
  if (!context.user) throw new Error("Not authenticated.");
  return getReviewData(context.entities, context.user.id, args);
}) satisfies GetReview<ReviewArgs, ReviewResult>;

export const saveReviewDraft = (async (args, context) => {
  if (!context.user) throw new Error("Not authenticated.");
  return saveReviewDraftData(context.entities, context.user.id, args);
}) satisfies SaveReviewDraft<SaveReviewArgs>;

export const completeReview = (async (args, context) => {
  if (!context.user) throw new Error("Not authenticated.");
  return completeReviewData(context.entities, context.user.id, args);
}) satisfies CompleteReview<SaveReviewArgs>;
