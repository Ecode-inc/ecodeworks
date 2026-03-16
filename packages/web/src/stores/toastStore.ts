import { create } from 'zustand'

interface Toast {
  id: string
  type: 'info' | 'success' | 'error' | 'warning'
  title: string
  message?: string
}

interface ToastStore {
  toasts: Toast[]
  addToast: (type: Toast['type'], title: string, message?: string) => void
  removeToast: (id: string) => void
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],

  addToast: (type, title, message) => {
    const id = crypto.randomUUID()
    set((s) => ({ toasts: [...s.toasts, { id, type, title, message }] }))

    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, 4000)
  },

  removeToast: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  },
}))
