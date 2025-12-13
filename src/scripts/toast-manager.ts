interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
}

class ToastManager {
  private toasts: Toast[] = [];
  private container: HTMLElement | null = null;

  constructor() {
    this.init();
  }

  private init() {
    if (typeof document !== 'undefined') {
      this.container = document.createElement('div');
      this.container.id = 'toast-container';
      this.container.className = 'fixed top-4 right-4 z-50 space-y-2 pointer-events-none';
      document.body.appendChild(this.container);
    }
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 9);
  }

  private createToastElement(toast: Toast): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.id = `toast-wrapper-${toast.id}`;
    wrapper.className = 'pointer-events-auto transform transition-all duration-300 ease-in-out translate-x-full opacity-0';

    const toastEl = document.createElement('div');
    toastEl.id = `toast-${toast.id}`;
    toastEl.className = `flex items-center gap-3 p-4 text-white rounded-lg shadow-lg ${
      toast.type === 'success' ? 'bg-green-500' :
      toast.type === 'error' ? 'bg-red-500' :
      toast.type === 'warning' ? 'bg-yellow-500' :
      'bg-blue-500'
    }`;
    toastEl.setAttribute('role', 'alert');
    toastEl.setAttribute('aria-live', 'polite');

    // Add icon
    const icon = document.createElement('div');
    icon.className = 'w-5 h-5 flex-shrink-0';
    icon.innerHTML = {
      success: '✓',
      error: '✕',
      warning: '⚠',
      info: 'ℹ'
    }[toast.type];
    toastEl.appendChild(icon);

    // Add message
    const message = document.createElement('p');
    message.className = 'text-sm font-medium';
    message.textContent = toast.message;
    toastEl.appendChild(message);

    // Add close button
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'ml-4 text-white/70 hover:text-white transition-colors text-xl';
    closeBtn.innerHTML = '×';
    closeBtn.setAttribute('aria-label', 'Close notification');
    closeBtn.onclick = () => this.removeToast(toast.id);
    toastEl.appendChild(closeBtn);

    wrapper.appendChild(toastEl);
    return wrapper;
  }

  public showToast(message: string, type: Toast['type'] = 'info', duration: number = 5000): string {
    if (!this.container) {
      console.warn('Toast container not initialized');
      return '';
    }

    const id = this.generateId();
    const toast: Toast = { id, message, type, duration };

    const wrapper = this.createToastElement(toast);
    this.container.appendChild(wrapper);

    // Animate in
    requestAnimationFrame(() => {
      wrapper.classList.remove('translate-x-full', 'opacity-0');
      wrapper.classList.add('translate-x-0', 'opacity-100');
    });

    // Auto remove
    if (duration > 0) {
      setTimeout(() => {
        this.removeToast(id);
      }, duration);
    }

    return id;
  }

  public removeToast(id: string): void {
    const wrapper = document.getElementById(`toast-wrapper-${id}`);
    if (wrapper) {
      wrapper.classList.add('translate-x-full', 'opacity-0');
      setTimeout(() => {
        wrapper.remove();
      }, 300);
    }
  }

  public clearToasts(): void {
    if (this.container) {
      this.container.innerHTML = '';
    }
  }
}

// Global instance
const toastManagerInstance = typeof window !== 'undefined' ? new ToastManager() : null;

// Expose globally
if (typeof window !== 'undefined' && toastManagerInstance) {
  window.toastManager = toastManagerInstance;

  window.toast = {
    success: (message: string, duration?: number) => toastManagerInstance.showToast(message, 'success', duration),
    error: (message: string, duration?: number) => toastManagerInstance.showToast(message, 'error', duration),
    warning: (message: string, duration?: number) => toastManagerInstance.showToast(message, 'warning', duration),
    info: (message: string, duration?: number) => toastManagerInstance.showToast(message, 'info', duration),
  };

  // Replace global alert with toast
  const originalAlert = window.alert;
  window.alert = function(message: string, type: 'success' | 'error' | 'warning' | 'info' = 'warning') {
    window.toast.warning(message);
  };
}

// Export for TypeScript support
export const toastManager = toastManagerInstance;
export const toast = typeof window !== 'undefined' ? window.toast : {
  success: () => {},
  error: () => {},
  warning: () => {},
  info: () => {},
};