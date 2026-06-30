export const DEFAULT_ADMIN_EMAIL = "zeljko@dakic.com";

export function getAdminEmail() {
  return process.env.ACTIONAMP_ADMIN_EMAIL?.trim() || DEFAULT_ADMIN_EMAIL;
}

export function shouldSendFeedbackEmail() {
  return process.env.NODE_ENV === "production";
}
