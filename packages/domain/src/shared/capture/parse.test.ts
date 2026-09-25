// The real-Temporal run: Bun's native global (the api's flavor).
import { parseCapture } from "./parse.js";
import { parserSuite } from "./parse.suite.js";

parserSuite(parseCapture);
