import Inbox from '~icons/lucide/inbox';
import FolderKanban from '~icons/lucide/folder-kanban';
import LayoutGrid from '~icons/lucide/layout-grid';
import CalendarCheck from '~icons/lucide/calendar-check';
import Zap from '~icons/lucide/zap';
import Plus from '~icons/lucide/plus';
import ListChecks from '~icons/lucide/list-checks';
import Target from '~icons/lucide/target';
import Search from '~icons/lucide/search';
import Palette from '~icons/lucide/palette';

export type NavItem = {
  name: string;
  href: string;
  icon?: any;
  subitems?: { name: string; href: string }[];
};

export function buildNavItems(contextProjects: any[]): NavItem[] {
  return [
    { name: 'Capture', href: '/capture', icon: Plus },
    { name: 'Next Action', href: '/next', icon: Target },
    { name: 'Inbox', href: '/inbox', icon: Inbox },
    { name: 'Triage', href: '/triage', icon: ListChecks },
    { name: 'Search', href: '/search', icon: Search },
    {
      name: 'Projects',
      href: '/projects',
      icon: FolderKanban,
      subitems: contextProjects.map((p: any) => ({ name: p.name, href: p.permalink })),
    },
    { name: 'Areas', href: '/areas', icon: LayoutGrid },
    { name: 'Reviews', href: '/reviews', icon: CalendarCheck },
    {
      name: 'Design Showcase',
      href: '/design-showcase',
      icon: Palette,
      subitems: [
        { name: 'Design Tokens', href: '/design-showcase/design-tokens' },
        { name: 'Components', href: '/design-showcase/components' },
        { name: 'Patterns', href: '/design-showcase/patterns' },
        { name: 'Typography', href: '/design-showcase/typography' },
        { name: 'Iconography', href: '/design-showcase/iconography' },
        { name: 'Accessibility', href: '/design-showcase/accessibility' },
        { name: 'Templates', href: '/design-showcase/templates' },
      ],
    },
  ];
}
