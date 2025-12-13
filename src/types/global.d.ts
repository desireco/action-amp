declare global {
  interface Window {
    toastManager: {
      showToast: (message: string, type?: 'success' | 'error' | 'warning' | 'info', duration?: number) => string;
      removeToast: (id: string) => void;
      clearToasts: () => void;
    };
    toast: {
      success: (message: string, duration?: number) => void;
      error: (message: string, duration?: number) => void;
      warning: (message: string, duration?: number) => void;
      info: (message: string, duration?: number) => void;
    };
  }
}

export {};