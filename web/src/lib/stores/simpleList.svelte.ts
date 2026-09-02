/**
 * Simple-list store — the checklist surface's data client (F9a pattern).
 * Selection + editing state stay in the component; the store owns items and
 * the write ops, with per-key `saving` and a user-presentable error.
 */
import { client } from "../api";
import type { ListItemDto } from "../dto";

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

class SimpleListStore {
  items = $state<ListItemDto[]>([]);
  /** The list the store currently holds (set by load / passed to ops). */
  projectId = $state<string | null>(null);
  loading = $state(false);
  loaded = $state(false);
  /** The op key currently in flight ("add", an item id, or "clear"). */
  saving = $state<string | null>(null);
  error = $state<string | null>(null);

  get open(): ListItemDto[] {
    return this.items.filter((item) => !item.isDone);
  }
  get checked(): ListItemDto[] {
    return this.items.filter((item) => item.isDone);
  }
  /** Ordered = open then checked — the J/K traversal order. */
  get ordered(): ListItemDto[] {
    return [...this.open, ...this.checked];
  }

  async load(projectId: string) {
    this.projectId = projectId;
    this.loading = true;
    this.error = null;
    try {
      this.items = await client.tasks.simpleList({ projectId });
      this.loaded = true;
    } catch (e) {
      this.error = errorMessage(e, "Couldn't load this list.");
    } finally {
      this.loading = false;
    }
  }

  private async reload() {
    if (!this.projectId) return;
    this.items = await client.tasks.simpleList({ projectId: this.projectId });
  }

  async mutate<T>(key: string, action: () => Promise<T>): Promise<boolean> {
    this.saving = key;
    this.error = null;
    try {
      await action();
      return true;
    } catch (cause) {
      this.error = errorMessage(cause, "Couldn't save that change. Try again.");
      return false;
    } finally {
      this.saving = null;
    }
  }

  add(text: string) {
    return this.mutate("add", async () => {
      await client.tasks.createListItem({ projectId: this.projectId ?? "", text });
      await this.reload();
    });
  }

  rename(id: string, text: string) {
    return this.mutate(id, async () => {
      await client.tasks.renameListItem({ id, text });
      await this.reload();
    });
  }

  toggle(item: ListItemDto) {
    return this.mutate(item.id, async () => {
      await client.tasks.setListItemDone({ id: item.id, isDone: !item.isDone });
      await this.reload();
    });
  }

  remove(id: string) {
    return this.mutate(id, async () => {
      await client.tasks.deleteListItem({ id });
      this.items = this.items.filter((item) => item.id !== id);
    });
  }

  clearChecked() {
    return this.mutate("clear", async () => {
      await client.tasks.clearCompletedListItems({ projectId: this.projectId ?? "" });
      this.items = this.items.filter((item) => !item.isDone);
    });
  }
}

export const simpleListStore = new SimpleListStore();
