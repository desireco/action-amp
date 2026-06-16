import { MarkdownPage } from "../shared/MarkdownPage";
import about from "../public-content/about.md?raw";

export function AboutPage() {
  return <MarkdownPage>{about}</MarkdownPage>;
}
