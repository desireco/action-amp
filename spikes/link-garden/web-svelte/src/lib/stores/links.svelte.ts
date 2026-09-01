import { client, type Link, type LinkStatus } from "../api";
import { isValidUrl, parseCapture } from "../parse";

/** Link collection state + all mutations (optimistic, with rollback). */
class LinksStore {
  links = $state<Link[]>([]);
  tab = $state<LinkStatus>("NEW");
  selected = $state(0);
  tagFilter = $state<string | null>(null);
  /** id of the link whose inline tag input is open (set by the T key). */
  tagTarget = $state<string | null>(null);
  error = $state("");
  stats = $state<{ captured: number; kept: number } | null>(null);

  get shown(): Link[] {
    return this.links.filter(
      (l) => l.status === this.tab && (!this.tagFilter || l.tags.includes(this.tagFilter)),
    );
  }

  countFor(status: LinkStatus): number {
    return this.links.filter((l) => l.status === status).length;
  }

  get statsText(): string {
    const { captured = 0, kept = 0 } = this.stats ?? {};
    return `today: ${captured} captured · ${kept} kept`;
  }

  async load() {
    try {
      const [all, stats] = await Promise.all([client.links.list({}), client.stats.today()]);
      this.links = all;
      this.stats = stats;
    } catch (e) {
      this.error = String(e);
    }
  }

  refreshStats() {
    client.stats.today().then((s) => (this.stats = s)).catch(() => {});
  }

  /** Returns an error string for the caller to surface, or null on success. */
  async capture(text: string): Promise<string | null> {
    const { url, tags } = parseCapture(text);
    if (!url) return "enter a url (plus optional #tags)";
    if (!isValidUrl(url)) return "enter a full url starting with http:// or https://";
    try {
      const link = await client.links.create({ url, tags });
      this.links = [link, ...this.links];
      this.tab = "NEW";
      this.refreshStats();
      return null;
    } catch (e) {
      return String(e);
    }
  }

  private replace(updated: Link) {
    this.links = this.links.map((l) => (l.id === updated.id ? updated : l));
  }

  async setStatus(next: LinkStatus) {
    const link = this.shown[this.selected];
    if (!link) return;
    const prev = link.status;
    this.links = this.links.map((l) => (l.id === link.id ? { ...l, status: next } : l));
    try {
      this.replace(await client.links.setStatus({ id: link.id, status: next }));
      this.refreshStats();
    } catch (e) {
      this.error = String(e);
      this.links = this.links.map((l) => (l.id === link.id ? { ...l, status: prev } : l));
    }
  }

  async submitTag(link: Link, name: string) {
    if (!name || link.tags.includes(name)) return;
    this.links = this.links.map((l) => (l.id === link.id ? { ...l, tags: [...l.tags, name] } : l));
    try {
      this.replace(await client.links.addTag({ id: link.id, name }));
    } catch (e) {
      this.error = String(e);
      this.links = this.links.map(
        (l) => (l.id === link.id ? { ...l, tags: l.tags.filter((t) => t !== name) } : l),
      );
    }
  }

  move(delta: 1 | -1) {
    this.selected = Math.min(Math.max(this.selected + delta, 0), this.shown.length - 1);
  }
}

export const links = new LinksStore();
