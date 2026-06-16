import { MarkdownPage } from "../shared/MarkdownPage";
import terms from "../public-content/terms.md?raw";

export function TermsPage() {
  return <MarkdownPage>{terms}</MarkdownPage>;
}
