// services/cdsbot/src/utils/websocket.js

class WebSocketManager {
  constructor () {
    this.connections = new Map();
    this.messageHandlers = new Map();
    this.middleware = {
      connection: [],
      message: [],
      close: [],
    };
    this.heartbeatInterval = 30000; // 30 seconds
    this.heartbeatTimeout = 60000; // 60 seconds
  }

  initialize (app) {
    app.use(async (ctx, next) => {
      if (ctx.isUpgradable) {
        const ws = await ctx.upgrade();
        console.log('New WebSocket connection established');

        const connectionId = crypto.randomUUID();
        const wsContext = this.createContext(ws, connectionId);

        ws.onopen = async () => {
          wsContext.event = 'connection';
          await this.runMiddleware(wsContext, 'connection');
          this.connections.set(connectionId, {
            connectionId,
            ws,
            metadata: wsContext.metadata,
            lastHeartbeat: Date.now(),
          });
          this.startHeartbeat(connectionId);
        };

        ws.onmessage = async (event) => {
          if (event.data === 'ping') {
            ws.send('pong');
            return;
          }
          wsContext.event = 'message';
          wsContext.message = event.data;
          await this.runMiddleware(wsContext, 'message');
          if (!wsContext.messageHandled) {
            if (event.data === 'pong') {
              this.updateHeartbeat(connectionId);
            } else {
              await this.routeMessage(connectionId, event.data);
            }
          }
        };

        ws.onclose = async () => {
          wsContext.event = 'close';
          await this.runMiddleware(wsContext, 'close');
          this.removeConnection(connectionId);
        };
      } else {
        await next();
      }
    });

    // attach ws to context
    app.use((ctx, next) => {
      ctx.wss = this;
      return next();
    });

    // attach wss to the app
    app.wss = this;

    console.log('WebSocket handler initialized');
    this.startCleanupInterval();
    return this;
  }

  createContext (ws, connectionId) {
    return {
      ws,
      connectionId,
      event: null,
      message: null,
      metadata: {},
      messageHandled: false,
      send: (message) => this.sendTo(connectionId, message),
      broadcast: (message) => this.broadcast(message),
      setMetadata: (key, value) => {
        this.setMetadata(connectionId, key, value);
        const conn = this.connections.get(connectionId);
        if (conn) conn.metadata[key] = value;
      },
      getMetadata: (key) => this.getMetadata(connectionId, key),
    };
  }

  async runMiddleware (context, event) {
    const middlewareChain = this.middleware[event];
    let prevIndex = -1;
    const runner = async (index) => {
      if (index === prevIndex) {
        throw new Error('next() called multiple times');
      }
      prevIndex = index;
      const middleware = middlewareChain[index];
      if (middleware) {
        await middleware(context, () => runner(index + 1));
      }
    };
    await runner(0);
  }

  use (event, middleware) {
    if (!this.middleware[event]) {
      throw new Error(`Invalid event type: ${event}`);
    }
    this.middleware[event].push(middleware);
  }

  removeConnection (id) {
    const connection = this.connections.get(id);
    if (connection) {
      clearInterval(connection.heartbeatInterval);
      this.connections.delete(id);
      console.log(`WebSocket connection ${id} removed`);
    }
  }

  broadcast (message, filterFn) {
    const messageString = JSON.stringify(({
      timestamp: new Date().toISOString(),
      ...message,
    }));
    const stats = { total: this.connections.size, sent: 0 };
    for (const [connectionId, { ws, metadata }] of this.connections) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      if (filterFn && !filterFn(connectionId, metadata)) continue;
      stats.sent++;
      ws.send(messageString);
    }
    return stats;
  }

  sendTo (id, message) {
    const connection = this.connections.get(id);
    if (connection && connection.ws.readyState === WebSocket.OPEN) {
      connection.ws.send(JSON.stringify({
        timestamp: new Date().toISOString(),
        ...message,
      }));
    } else if (connection) {
      console.warn(`WebSocket for connection ${id} is not open. Current state: ${connection.ws.readyState}`);
    } else {
      console.warn(`Attempted to send message to non-existent connection: ${id}`);
    }
  }

  async routeMessage (connectionId, message) {
    try {
      const data = JSON.parse(message);
      const handler = this.messageHandlers.get(data.type);
      if (handler) {
        await handler(connectionId, data);
      } else {
        console.warn(`No handler registered for message type: ${data.type}`);
      }
    } catch (error) {
      console.error('Error processing WebSocket message:', error);
    }
  }

  registerHandler (messageType, handler) {
    this.messageHandlers.set(messageType, handler);
  }

  setMetadata (connectionId, key, value) {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.metadata[key] = value;
    } else {
      console.warn(`Attempted to set metadata for non-existent connection: ${connectionId}`);
    }
  }

  getMetadata (connectionId, key) {
    const connection = this.connections.get(connectionId);
    if (connection) {
      return connection.metadata[key];
    }
    return undefined;
  }

  isConnectionOpen (connectionId) {
    const connection = this.connections.get(connectionId);
    return connection && connection.ws.readyState === WebSocket.OPEN;
  }

  startHeartbeat (connectionId) {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.heartbeatInterval = setInterval(() => {
        if (connection.ws.readyState === WebSocket.OPEN) {
          connection.ws.send('ping');
        } else {
          this.removeConnection(connectionId);
        }
      }, this.heartbeatInterval);
    }
  }

  updateHeartbeat (connectionId) {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.lastHeartbeat = Date.now();
    }
  }

  startCleanupInterval () {
    setInterval(() => {
      const now = Date.now();
      for (const [id, connection] of this.connections) {
        if (now - connection.lastHeartbeat > this.heartbeatTimeout) {
          console.log(`Closing inactive connection: ${id}`);
          connection.ws.close();
          this.removeConnection(id);
        }
      }
    }, this.heartbeatInterval);
  }
}

export const websocket = new WebSocketManager();
