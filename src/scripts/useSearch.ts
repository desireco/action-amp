export interface SearchResult {
  title: string;
  description?: string;
  url: string;
  collection: string;
  status?: string;
  priority?: string;
  area?: string;
}

export type SearchState = "empty" | "loading" | "results" | "none";

export class SearchManager {
  private debounceTimer: number;
  private elements: {
    searchInput: HTMLInputElement;
    filterCollection: HTMLSelectElement;
    filterStatus: HTMLSelectElement;
    filterPriority: HTMLSelectElement;
    clearFiltersBtn: HTMLButtonElement;
    resultsContainer: HTMLElement;
  };

  constructor() {
    this.debounceTimer = 0;

    // Get DOM elements
    this.elements = {
      searchInput: document.getElementById("search-input") as HTMLInputElement,
      filterCollection: document.getElementById("filter-collection") as HTMLSelectElement,
      filterStatus: document.getElementById("filter-status") as HTMLSelectElement,
      filterPriority: document.getElementById("filter-priority") as HTMLSelectElement,
      clearFiltersBtn: document.getElementById("clear-filters") as HTMLButtonElement,
      resultsContainer: document.getElementById("results-container") as HTMLElement,
    };

    // Validate elements exist
    Object.entries(this.elements).forEach(([key, element]) => {
      if (!element) {
        throw new Error(`Required element not found: ${key}`);
      }
    });

    this.setupEventListeners();
  }

  private setupEventListeners() {
    // Search input with debouncing
    this.elements.searchInput.addEventListener("input", () => {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = window.setTimeout(() => this.performSearch(), 300);
    });

    // Filter changes
    this.elements.filterCollection.addEventListener("change", () => this.performSearch());
    this.elements.filterStatus.addEventListener("change", () => this.performSearch());
    this.elements.filterPriority.addEventListener("change", () => this.performSearch());

    // Clear filters
    this.elements.clearFiltersBtn.addEventListener("click", () => {
      this.clearFilters();
    });

    // Keyboard shortcut (Cmd/Ctrl + K)
    document.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        this.elements.searchInput.focus();
      }
    });
  }

  private clearFilters() {
    this.elements.searchInput.value = "";
    this.elements.filterCollection.value = "";
    this.elements.filterStatus.value = "";
    this.elements.filterPriority.value = "";
    this.showState("empty");
  }

  private showState(state: SearchState) {
    // We'll update the entire results container via fetch
    const params = new URLSearchParams();
    params.set("state", state);

    // If we have results, include them
    if (state === "results") {
      // This will be handled by the performSearch method
    }
  }

  async performSearch() {
    const query = this.elements.searchInput.value.trim();
    const collection = this.elements.filterCollection.value;
    const status = this.elements.filterStatus.value;
    const priority = this.elements.filterPriority.value;

    if (!query && !collection && !status && !priority) {
      this.renderState("empty");
      return;
    }

    this.renderState("loading");

    try {
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      if (collection) params.set("collection", collection);
      if (status) params.set("status", status);
      if (priority) params.set("priority", priority);

      const response = await fetch(`/api/search?${params.toString()}`);
      if (!response.ok) throw new Error("Search failed");

      const results: SearchResult[] = await response.json();
      this.renderResults(results);
    } catch (error) {
      console.error("Search error:", error);
      alert("Search failed. Please try again.");
      this.renderState("empty");
    }
  }

  private renderState(state: SearchState) {
    // Fetch the updated search results component from the server
    const params = new URLSearchParams();
    params.set("state", state);
    params.set("partial", "true"); // Signal that this is a partial update

    fetch(`/search?${params.toString()}`, {
      headers: {
        "X-Partial": "true",
      },
    })
      .then((response) => response.text())
      .then((html) => {
        // Create a temporary DOM element to parse the response
        const temp = document.createElement("div");
        temp.innerHTML = html;

        // Find the results container in the response
        const newResultsContainer = temp.querySelector("#results-container");
        if (newResultsContainer) {
          this.elements.resultsContainer.innerHTML = newResultsContainer.innerHTML;
        }
      })
      .catch((error) => {
        console.error("Failed to update search results:", error);
      });
  }

  private renderResults(results: SearchResult[]) {
    if (results.length === 0) {
      this.renderState("none");
      return;
    }

    // Generate HTML for results
    const resultsHtml = results
      .map((result) => this.createResultItemHtml(result))
      .join("");

    // Update the results container
    this.elements.resultsContainer.innerHTML = `
      <div class="space-y-3">
        ${resultsHtml}
      </div>
    `;
  }

  private createResultItemHtml(result: SearchResult): string {
    const icon = this.getCollectionIcon(result.collection);
    const badge = this.getCollectionBadge(result.collection);
    const statusBadge = result.status ? this.getStatusBadge(result.status) : "";
    const priorityBadge = result.priority ? this.getPriorityBadge(result.priority) : "";

    return `
      <a href="${result.url}" class="block group">
        <div class="p-4 bg-surface border border-border rounded-lg hover:border-primary/50 transition-all duration-200 hover:shadow-md">
          <div class="flex items-start gap-3">
            <div class="flex-shrink-0 mt-1">
              ${icon}
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                ${badge}
                ${statusBadge}
                ${priorityBadge}
              </div>
              <h3 class="text-base font-semibold text-text-main group-hover:text-primary transition-colors">
                ${this.escapeHtml(result.title)}
              </h3>
              ${
                result.description
                  ? `
                <p class="text-sm text-text-muted mt-1 line-clamp-2">
                  ${this.escapeHtml(result.description)}
                </p>
              `
                  : ""
              }
              ${
                result.area
                  ? `
                <p class="text-xs text-text-muted mt-2">
                  Area: <span class="text-text-main">${this.escapeHtml(result.area)}</span>
                </p>
              `
                  : ""
              }
            </div>
          </div>
        </div>
      </a>
    `;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  private getCollectionIcon(collection: string): string {
    const iconClass = "h-5 w-5 text-text-muted";
    switch (collection) {
      case "inbox":
        return `<svg class="${iconClass}" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path></svg>`;
      case "actions":
        return `<svg class="${iconClass}" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 17 2 2 4-4"></path><path d="m3 7 2 2 4-4"></path><path d="M13 6h8"></path><path d="M13 12h8"></path><path d="M13 18h8"></path></svg>`;
      case "projects":
        return `<svg class="${iconClass}" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"></path><path d="M8 10v4"></path><path d="M12 10v2"></path><path d="M16 10v6"></path></svg>`;
      case "areas":
        return `<svg class="${iconClass}" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"></rect><rect width="7" height="7" x="14" y="3" rx="1"></rect><rect width="7" height="7" x="14" y="14" rx="1"></rect><rect width="7" height="7" x="3" y="14" rx="1"></rect></svg>`;
      case "reviews":
        return `<svg class="${iconClass}" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4"></path><path d="M16 2v4"></path><rect width="18" height="18" x="3" y="4" rx="2"></rect><path d="m9 11 3 3 8-8"></path></svg>`;
      default:
        return `<svg class="${iconClass}" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`;
    }
  }

  private getCollectionBadge(collection: string): string {
    const colors: Record<string, string> = {
      inbox: "bg-blue-500/10 text-blue-500",
      actions: "bg-green-500/10 text-green-500",
      projects: "bg-purple-500/10 text-purple-500",
      areas: "bg-orange-500/10 text-orange-500",
      reviews: "bg-pink-500/10 text-pink-500",
    };
    const color = colors[collection] || "bg-gray-500/10 text-gray-500";
    return `<span class="text-xs font-medium px-2 py-0.5 rounded-full ${color} capitalize">${collection}</span>`;
  }

  private getStatusBadge(status: string): string {
    const colors: Record<string, string> = {
      draft: "bg-orange-500/10 text-orange-500",
      todo: "bg-gray-500/10 text-gray-500",
      in_progress: "bg-blue-500/10 text-blue-500",
      completed: "bg-green-500/10 text-green-500",
      blocked: "bg-red-500/10 text-red-500",
      cancelled: "bg-gray-500/10 text-gray-500",
      active: "bg-green-500/10 text-green-500",
      archived: "bg-gray-500/10 text-gray-500",
      on_hold: "bg-yellow-500/10 text-yellow-500",
    };
    const color = colors[status] || "bg-gray-500/10 text-gray-500";
    const label = status.replace("_", " ");
    return `<span class="text-xs font-medium px-2 py-0.5 rounded-full ${color} capitalize">${label}</span>`;
  }

  private getPriorityBadge(priority: string): string {
    const colors: Record<string, string> = {
      high: "bg-red-500/10 text-red-500",
      medium: "bg-yellow-500/10 text-yellow-500",
      low: "bg-gray-500/10 text-gray-500",
    };
    const color = colors[priority] || "bg-gray-500/10 text-gray-500";
    return `<span class="text-xs font-medium px-2 py-0.5 rounded-full ${color} capitalize">${priority}</span>`;
  }

  // Initialize search from URL query
  initializeFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const initialQ = params.get("q") || "";
    if (initialQ) {
      this.elements.searchInput.value = initialQ;
      this.performSearch();
    }
  }
}