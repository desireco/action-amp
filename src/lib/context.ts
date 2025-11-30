import type { AppSettings } from './data/settings';

export function getContextData(settings: AppSettings) {
  const currentContext = settings.next_action_context;
  const currentContextName = settings.areas?.find((a: any) => a.slug === currentContext)?.name ?? currentContext;
  let contextProjects: any[] = [];
  if (currentContext && settings.projects) {
    contextProjects = settings.projects
      .filter((p: any) => p.area === currentContext);
  }
  return { currentContext, currentContextName, contextProjects };
}
