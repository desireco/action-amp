import { WelcomeEmailTemplate } from "../../onboarding/welcomeEmail";

export default function WelcomeEmailPreview() {
  return (
    <WelcomeEmailTemplate firstName="Jake" appUrl="https://actionamp.com" />
  );
}
