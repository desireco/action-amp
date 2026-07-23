import { FeedbackEmail } from "../FeedbackEmail";

export default function FeedbackEmailPreview() {
  return (
    <FeedbackEmail
      id="feedback-1"
      message={"The move button feels buried.\nMaybe surface it beside snooze."}
      route="/app/projects/general"
      section="work"
      lensName="Work"
      lensColor="indigo"
      userName="Zeljko Dakic"
      userEmail="zeljko@example.com"
      userAgent="React Email preview"
      viewport="1440x900"
      timezone="America/Toronto"
    />
  );
}
