/** The admin cores (S17) — see ./operationsCore.ts, ./userManagementCore.ts
 *  and ./funnelCore.ts for the port notes. */
export {
  ACTIVITY_TREND_WEEKS,
  getActivityStatsCore,
  getAdminStatsCore,
  getRecentFeedbackCore,
  startOfISOWeek,
  type ActivityStats,
  type ActivityWeek,
  type AdminStats,
  type DeviceUserCounts,
  type DeviceUserCountsByWindow,
  type FeedbackStatusCounts,
} from "./operationsCore.js";
export {
  AdminUserDeletionBlockedError,
  AdminUserInputError,
  AdminUserMutationError,
  USER_ACCESS_FILTERS,
  USER_SORTS,
  deleteAdminUserCore,
  deleteAdminUsersCore,
  getAdminUsersCore,
  grantAdminUserAccessCore,
  removeAdminUserAccessCore,
  type AdminMutationDeps,
  type AdminStripeClient,
  type ManualGrant,
  type UserAccessFilter,
  type UserManagementEntities,
  type UserSort,
} from "./userManagementCore.js";
export {
  getFunnelStatsCore,
  type FunnelEntities,
  type FunnelRange,
  type FunnelStats,
} from "./funnelCore.js";
