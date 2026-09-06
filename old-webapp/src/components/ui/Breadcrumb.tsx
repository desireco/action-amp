import "./Breadcrumb.css";

export interface BreadcrumbItem {
  /** Unique id */
  id: string;
  /** Display label */
  label: string;
}

interface BreadcrumbProps {
  /** Crumbs, ordered shallowest→deepest (Goal › Project › Task) */
  items: BreadcrumbItem[];
  /** Currently-active crumb id (the zoom position) */
  active: string;
  /** Called when a crumb is selected */
  onSelect: (id: string) => void;
  /** Separator between crumbs */
  separator?: string;
  className?: string;
}

/**
 * Breadcrumb — zoom orientation crumbs (Goal › Project › Task).
 *
 * The current scope crumb is highlighted teal; ancestors above dim slightly.
 * From mode-zoom-unified.html + mobile-gesture-modal.html + approach-a-zoom-pan.html.
 */
export function Breadcrumb({
  items,
  active,
  onSelect,
  separator = "/",
  className = "",
}: BreadcrumbProps) {
  const activeIdx = items.findIndex((i) => i.id === active);
  return (
    <nav className={["aa-breadcrumb", className].filter(Boolean).join(" ")} aria-label="Hierarchy">
      {items.map((item, idx) => {
        const isActive = item.id === active;
        const isAncestor = activeIdx !== -1 && idx > activeIdx;
        return (
          <span key={item.id} className="aa-breadcrumb__pair">
            {idx > 0 && (
              <span className="aa-breadcrumb__sep" aria-hidden="true">
                {separator}
              </span>
            )}
            <button
              type="button"
              className={[
                "aa-breadcrumb__crumb",
                isActive ? "aa-breadcrumb__crumb--active" : "",
                isAncestor ? "aa-breadcrumb__crumb--ancestor" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-current={isActive ? "location" : undefined}
              onClick={() => onSelect(item.id)}
            >
              {item.label}
            </button>
          </span>
        );
      })}
    </nav>
  );
}
