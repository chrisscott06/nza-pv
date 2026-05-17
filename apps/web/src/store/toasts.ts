import { nanoid } from 'nanoid';
import { create } from 'zustand';

export type ToastKind = 'info' | 'error' | 'warning';
export type Toast = { id: string; kind: ToastKind; message: string; ttlMs: number };

type ToastState = {
  toasts: Toast[];
  push: (message: string, kind?: ToastKind, ttlMs?: number) => void;
  dismiss: (id: string) => void;
};

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (message, kind = 'info', ttlMs = 4500) => {
    const id = nanoid(8);
    set((s) => ({ toasts: [...s.toasts, { id, kind, message, ttlMs }] }));
    if (ttlMs > 0) {
      setTimeout(() => {
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
      }, ttlMs);
    }
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export const toast = {
  info: (msg: string) => useToasts.getState().push(msg, 'info'),
  warn: (msg: string) => useToasts.getState().push(msg, 'warning'),
  error: (msg: string) => useToasts.getState().push(msg, 'error', 7000),
};
