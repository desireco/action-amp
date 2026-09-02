// S9 — public export barrel for the resources surface (same pattern as
// src/projects/index.ts).
export {
  createResourceCore,
  deleteResourceCore,
  getResourceData,
  getProjectResourcesData,
  updateResourceCore,
  type ResourceInput,
  type ResourceWithLensRow,
} from './operationsCore.js';
export {
  assertResourceProject,
  resourceProjectLookup,
  RESOURCE_LENS_MESSAGE,
  type ResourceProjectRef,
} from './guards.js';
