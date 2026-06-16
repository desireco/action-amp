import { MarkdownPage } from "../shared/MarkdownPage";
import privacy from "../public-content/privacy.md?raw";

export function PrivacyPage() {
  return <MarkdownPage>{privacy}</MarkdownPage>;
}
