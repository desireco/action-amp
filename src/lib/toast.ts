export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
}

let toasts: Toast[] = [];
let subscribers: Set<(toasts: Toast[]) => void> = new Set();

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

export function subscribe(callback: (toasts: Toast[]) => void): () => void {
  subscribers.add(callback);
  callback(toasts);

  return () => {
    subscribers.delete(callback);
  };
}

function notifySubscribers() {
  subscribers.forEach(callback => callback([...toasts]));
}

export function showToast(message: string, type: Toast['type'] = 'info', duration: number = 5000): string {
  const id = generateId();
  const toast: Toast = {
    id,
    message,
    type,
    duration
  };

  toasts.push(toast);
  notifySubscribers();

  if (duration > 0) {
    setTimeout(() => {
      removeToast(id);
    }, duration);
  }

  return id;
}

export function removeToast(id: string): void {
  toasts = toasts.filter(toast => toast.id !== id);
  notifySubscribers();
}

export function clearToasts(): void {
  toasts = [];
  notifySubscribers();
}

// Convenience functions
export const toast = {
  success: (message: string, duration?: number) => showToast(message, 'success', duration),
  error: (message: string, duration?: number) => showToast(message, 'error', duration),
  warning: (message: string, duration?: number) => showToast(message, 'warning', duration),
  info: (message: string, duration?: number) => showToast(message, 'info', duration),
};