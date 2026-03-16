import { create } from 'zustand'

interface WSStore {
  socket: WebSocket | null
  connected: boolean
  onlineUsers: { id: string; name?: string }[]
  connect: (deptId: string, token: string) => void
  disconnect: () => void
}

export const useWSStore = create<WSStore>((set, get) => ({
  socket: null,
  connected: false,
  onlineUsers: [],

  connect: (deptId, token) => {
    const { socket } = get()
    if (socket) {
      socket.close()
    }

    const apiUrl = import.meta.env.VITE_API_URL || ''
    let wsUrl: string
    if (apiUrl) {
      const wsBase = apiUrl.replace(/^http/, 'ws').replace(/\/api$/, '')
      wsUrl = `${wsBase}/ws?dept_id=${deptId}&token=${token}`
    } else {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      wsUrl = `${protocol}//${window.location.host}/ws?dept_id=${deptId}&token=${token}`
    }

    const ws = new WebSocket(wsUrl)

    ws.onopen = () => {
      set({ connected: true })
    }

    ws.onclose = () => {
      set({ connected: false, socket: null, onlineUsers: [] })

      // Auto-reconnect after 5s
      setTimeout(() => {
        if (!get().socket) {
          get().connect(deptId, token)
        }
      }, 5000)
    }

    ws.onerror = (e) => {
      console.error('WebSocket error:', e)
    }

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)

        switch (message.type) {
          case 'users:online':
            set({ onlineUsers: message.data })
            break
          case 'user:joined':
            set((s) => ({
              onlineUsers: [...s.onlineUsers.filter(u => u.id !== message.data.id), message.data],
            }))
            break
          case 'user:left':
            set((s) => ({
              onlineUsers: s.onlineUsers.filter(u => u.id !== message.data.id),
            }))
            break
          case 'pong':
            break
          default:
            // Extensible: other modules can listen via subscribe
            break
        }
      } catch (e) {
        console.error('Message parse error:', e)
      }
    }

    // Keep-alive ping
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }))
      }
    }, 30000)

    ws.addEventListener('close', () => {
      clearInterval(pingInterval)
    })

    set({ socket: ws })
  },

  disconnect: () => {
    const { socket } = get()
    if (socket) {
      socket.close()
      set({ socket: null, connected: false, onlineUsers: [] })
    }
  },
}))
