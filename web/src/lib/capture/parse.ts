// The capture parser lives in @actionamp/domain — single source; the domain
// suite pins it (parse.test.ts + parse.browser.test.ts run the same cases
// against both Temporal bindings). This wrapper keeps the ../capture/parse
// import path stable for its consumers.
//
// Import order is load-bearing: the browser Temporal binding must install
// globalThis.Temporal BEFORE the domain's temporal.ts module evaluates and
// binds whatever global it finds. If that order is ever broken the failure
// is a loud module-eval throw ("Temporal is not available") naming the fix.
import "@actionamp/domain/shared/time/browser";

export { parseCapture } from "@actionamp/domain/shared/capture";
export type {
  ParsedCapture,
  ParsedPriority,
  ParsedSize,
} from "@actionamp/domain/shared/capture";
