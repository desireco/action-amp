// Global keyboard shortcuts for ActionAmp

interface Shortcut {
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  action: () => void;
  description: string;
}

export class KeyboardShortcuts {
  private shortcuts: Shortcut[] = [];
  private helpModal: HTMLElement | null = null;

  constructor() {
    this.init();
  }

  private init() {
    // Register default shortcuts
    this.registerShortcuts();

    // Add event listener
    document.addEventListener('keydown', this.handleKeyDown.bind(this));
  }

  private registerShortcuts() {
    // Search (Cmd/Ctrl + K)
    this.addShortcut({
      key: 'k',
      ctrl: true,
      action: () => {
        const searchInput = document.getElementById('nav-search') || document.getElementById('search-input');
        if (searchInput) {
          searchInput.focus();
        }
      },
      description: 'Focus search'
    });

    // New item (Cmd/Ctrl + N)
    this.addShortcut({
      key: 'n',
      ctrl: true,
      action: () => {
        window.location.href = '/capture';
      },
      description: 'Create new item'
    });

    // Go to inbox (Cmd/Ctrl + I)
    this.addShortcut({
      key: 'i',
      ctrl: true,
      action: () => {
        window.location.href = '/inbox';
      },
      description: 'Go to inbox'
    });

    // Go to next action (Cmd/Ctrl + Shift + N)
    this.addShortcut({
      key: 'n',
      ctrl: true,
      shift: true,
      action: () => {
        window.location.href = '/next';
      },
      description: 'Go to next action'
    });

    // Settings (Cmd/Ctrl + ,)
    this.addShortcut({
      key: ',',
      ctrl: true,
      action: () => {
        window.location.href = '/settings';
      },
      description: 'Open settings'
    });

    // Show help (Cmd/Ctrl + /)
    this.addShortcut({
      key: '/',
      ctrl: true,
      action: () => {
        this.showHelp();
      },
      description: 'Show keyboard shortcuts'
    });

    // Escape to close modals
    this.addShortcut({
      key: 'Escape',
      action: () => {
        // Close any open dialogs
        const dialogs = document.querySelectorAll('dialog[open]');
        dialogs.forEach(dialog => {
          (dialog as HTMLDialogElement).close();
        });

        // Close help modal if open
        if (this.helpModal?.classList.contains('block')) {
          this.hideHelp();
        }

        // Close any dropdown menus
        const dropdowns = document.querySelectorAll('[role="menu"][aria-expanded="true"]');
        dropdowns.forEach(dropdown => {
          dropdown.setAttribute('aria-expanded', 'false');
        });
      },
      description: 'Close dialogs/menus'
    });

    // Bulk operations shortcuts on inbox page
    if (window.location.pathname === '/inbox') {
      // Select all (Cmd/Ctrl + A)
      this.addShortcut({
        key: 'a',
        ctrl: true,
        action: () => {
          const selectAll = document.getElementById('select-all') as HTMLInputElement;
          if (selectAll) {
            selectAll.click();
          }
        },
        description: 'Select all items'
      });

      // Delete selected (Cmd/Ctrl + Delete)
      this.addShortcut({
        key: 'Delete',
        ctrl: true,
        action: () => {
          const bulkDelete = document.getElementById('bulk-delete') as HTMLButtonElement;
          if (bulkDelete && !bulkDelete.disabled) {
            bulkDelete.click();
          }
        },
        description: 'Delete selected items'
      });
    }
  }

  addShortcut(shortcut: Shortcut) {
    this.shortcuts.push(shortcut);
  }

  private handleKeyDown(e: KeyboardEvent) {
    for (const shortcut of this.shortcuts) {
      if (this.matchesShortcut(e, shortcut)) {
        e.preventDefault();
        e.stopPropagation();
        shortcut.action();
        break;
      }
    }
  }

  private matchesShortcut(e: KeyboardEvent, shortcut: Shortcut): boolean {
    const ctrl = e.ctrlKey || e.metaKey;
    const alt = e.altKey;
    const shift = e.shiftKey;

    // Check if the event matches the shortcut
    if (e.key.toLowerCase() !== shortcut.key.toLowerCase()) {
      return false;
    }
    if (shortcut.ctrl && !ctrl) return false;
    if (!shortcut.ctrl && ctrl) return false;
    if (shortcut.alt && !alt) return false;
    if (!shortcut.alt && alt) return false;
    if (shortcut.shift && !shift) return false;
    if (!shortcut.shift && shift) return false;

    // Don't trigger shortcuts when typing in input fields
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.contentEditable === 'true') {
      // Allow Ctrl+K for search even in inputs
      if (!(shortcut.ctrl && shortcut.key === 'k')) {
        return false;
      }
    }

    return true;
  }

  private showHelp() {
    // Create help modal if it doesn't exist
    if (!this.helpModal) {
      this.helpModal = document.createElement('div');
      this.helpModal.className = 'fixed inset-0 z-50 hidden bg-black/50 backdrop-blur-sm flex items-center justify-center p-4';
      this.helpModal.setAttribute('role', 'dialog');
      this.helpModal.setAttribute('aria-modal', 'true');
      this.helpModal.setAttribute('aria-labelledby', 'shortcuts-title');

      this.helpModal.innerHTML = `
        <div class="bg-surface border border-border rounded-lg max-w-md w-full p-6 relative">
          <h2 id="shortcuts-title" class="text-lg font-semibold mb-4">Keyboard Shortcuts</h2>
          <button id="close-shortcuts" class="absolute top-4 right-4 text-text-muted hover:text-text-main" aria-label="Close">
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
          <dl class="space-y-3">
            ${this.shortcuts
              .filter(s => s.description !== 'Close dialogs/menus')
              .map(shortcut => {
                const keys = [];
                if (shortcut.ctrl) keys.push(navigator.platform.match('Mac') ? '⌘' : 'Ctrl');
                if (shortcut.alt) keys.push('Alt');
                if (shortcut.shift) keys.push('Shift');
                keys.push(shortcut.key.toUpperCase());

                return `
                  <div class="flex justify-between items-center">
                    <dt class="text-sm text-text-main">${shortcut.description}</dt>
                    <dd class="text-xs font-mono bg-surface-hover px-2 py-1 rounded">${keys.join(' + ')}</dd>
                  </div>
                `;
              })
              .join('')}
          </dl>
        </div>
      `;

      // Add event listeners
      this.helpModal.addEventListener('click', (e) => {
        if (e.target === this.helpModal) {
          this.hideHelp();
        }
      });

      document.getElementById('close-shortcuts')?.addEventListener('click', () => {
        this.hideHelp();
      });
    }

    // Show the modal
    this.helpModal.classList.remove('hidden');
    (this.helpModal.querySelector('button') as HTMLElement)?.focus();
  }

  private hideHelp() {
    if (this.helpModal) {
      this.helpModal.classList.add('hidden');
    }
  }

  // Public method to add shortcuts from other components
  public addGlobalShortcut(options: Omit<Shortcut, 'action'> & { action: () => void }) {
    this.addShortcut(options);
  }
}

// Initialize on page load
const keyboardShortcuts = new KeyboardShortcuts();
export { keyboardShortcuts };