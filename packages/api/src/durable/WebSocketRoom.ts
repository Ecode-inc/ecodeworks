interface Session {
  webSocket: WebSocket
  userId: string
  userName?: string
}

export class WebSocketRoom {
  private sessions: Map<WebSocket, Session> = new Map()
  private state: DurableObjectState

  constructor(state: DurableObjectState) {
    this.state = state
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    // Internal broadcast request
    if (url.pathname === '/broadcast') {
      const { type, data } = await request.json() as { type: string; data: unknown }
      this.broadcast(JSON.stringify({ type, data }))
      return new Response('ok')
    }

    // WebSocket upgrade
    const upgradeHeader = request.headers.get('Upgrade')
    if (upgradeHeader !== 'websocket') {
      return new Response('Expected WebSocket', { status: 400 })
    }

    const userId = url.searchParams.get('user_id')
    if (!userId) {
      return new Response('Missing user_id', { status: 400 })
    }

    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)

    this.handleSession(server, userId)

    return new Response(null, {
      status: 101,
      webSocket: client,
    })
  }

  private handleSession(webSocket: WebSocket, userId: string) {
    webSocket.accept()

    const session: Session = { webSocket, userId }
    this.sessions.set(webSocket, session)

    // Notify others
    this.broadcast(JSON.stringify({
      type: 'user:joined',
      data: { id: userId },
    }), webSocket)

    // Send current online users to the new connection
    const onlineUsers = Array.from(this.sessions.values()).map(s => ({
      id: s.userId,
      name: s.userName,
    }))
    webSocket.send(JSON.stringify({
      type: 'users:online',
      data: onlineUsers,
    }))

    webSocket.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(event.data as string)

        if (message.type === 'ping') {
          webSocket.send(JSON.stringify({ type: 'pong' }))
          return
        }

        if (message.type === 'setName') {
          session.userName = message.name
        }
      } catch (e) {
        console.error('Message parse error:', e)
      }
    })

    webSocket.addEventListener('close', () => {
      this.sessions.delete(webSocket)
      this.broadcast(JSON.stringify({
        type: 'user:left',
        data: { id: userId },
      }))
    })

    webSocket.addEventListener('error', () => {
      this.sessions.delete(webSocket)
    })
  }

  private broadcast(message: string, exclude?: WebSocket) {
    for (const [ws] of this.sessions) {
      if (ws !== exclude && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(message)
        } catch (e) {
          console.error('Send error:', e)
        }
      }
    }
  }
}
