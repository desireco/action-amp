import { type Spec, page, route } from "@wasp.sh/spec";
import { LandingPage } from "./LandingPage" with { type: "ref" };

export const landingSpec: Spec = [
  route("LandingRoute", "/", page(LandingPage, { authRequired: false })),
];
