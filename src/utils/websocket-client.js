// services/cdsbot/src/utils/websocket-client.js

import { config } from '../config.js';

class WebSocketClient {
  constructor () {
    this.url = `${config.hapihubApiUrl}/ws`;
    this.ws = null;
    this.isConnected = false;
    this.reconnectAttempt = 0;
    this.maxReconnectDelay = 10000;
    this.baseReconnectDelay = 1000;
    this.shouldReconnect = true;
    this.reconnectTimeout = null;
    this.handlers = new Map();
    this.pingInterval = null;
    this.pongTimeout = null;
  }

  initialize (app) {
    app.use((ctx, next) => {
      ctx.wsc = this;
      return next();
    });
    app.wsc = this;
    this.connect();
    console.log('WebSocket client initialized');
    return this;
  }

  connect () {
    if (this.ws) {
      this.ws.close();
    }

    const url = new URL(this.url);
    if (config.hapihubApiKey) {
      url.searchParams.append('token', config.hapihubApiKey);
    }
    console.log('Connecting to WebSocket server:', url.href);
    this.ws = new WebSocket(url);

    this.ws.onopen = this.onOpen.bind(this);
    this.ws.onmessage = this.onMessage.bind(this);
    this.ws.onclose = this.onClose.bind(this);
    this.ws.onerror = this.onError.bind(this);
  }

  onOpen () {
    console.log('Connected to WebSocket server');
    this.isConnected = true;
    this.reconnectAttempt = 0;
    this.triggerHandlers('connected', null);
    this.startHeartbeat();
  }

  onMessage (event) {
    try {
      if (event.data === 'pong') {
        this.handlePong();
        return;
      }
      const message = JSON.parse(event.data);
      this.handleMessage(message);
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  }

  onClose (event) {
    console.log(`Disconnected from WebSocket server. Code: ${event.code}, Reason: ${event.reason}`);
    this.cleanUp();
    this.scheduleReconnection();
  }

  onError (error) {
    console.error('WebSocket error:', error);
    this.triggerHandlers('error', error);
  }

  cleanUp () {
    this.isConnected = false;
    this.stopHeartbeat();
    this.triggerHandlers('disconnected', null);
  }

  scheduleReconnection () {
    if (!this.shouldReconnect) {
      console.log('Reconnection stopped. Use initialize() to reconnect.');
      return;
    }

    const delay = Math.min(
      this.maxReconnectDelay,
      this.baseReconnectDelay * Math.pow(2, this.reconnectAttempt),
    );

    console.log(`Attempting to reconnect in ${delay}ms...`);

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectAttempt++;
      this.connect();
    }, delay);
  }

  stop () {
    this.shouldReconnect = false;
    this.cleanUp();
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      this.ws.close();
    }
  }

  handleMessage (message) {
    const { path, event, ...data } = message;
    this.triggerHandlers([path, event].join(' '), data);
  }

  triggerHandlers (type, data) {
    const handlers = this.handlers.get(type) || new Set();
    console.log(`Triggering ${handlers.size} handlers for event type: ${type}`);
    handlers.forEach(handler => handler(data));
  }

  registerHandler (eventType, handler) {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType).add(handler);

    return () => {
      console.log('Unregistering handler:', eventType, handler);
      const handlers = this.handlers.get(eventType);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.handlers.delete(eventType);
        }
      }
    };
  }

  send (message) {
    if (this.isConnected && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('Attempted to send message while disconnected');
    }
  }

  startHeartbeat () {
    this.stopHeartbeat();
    this.pingInterval = setInterval(() => {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
        this.pongTimeout = setTimeout(() => {
          console.log('No pong received, closing connection');
          this.ws.close();
        }, 10000); // Wait 10 seconds for pong before closing
      }
    }, 30000); // Send ping every 30 seconds
  }

  stopHeartbeat () {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.pongTimeout) {
      clearTimeout(this.pongTimeout);
      this.pongTimeout = null;
    }
  }

  handlePong () {
    if (this.pongTimeout) {
      clearTimeout(this.pongTimeout);
      this.pongTimeout = null;
    }
  }
}

// Export a default instance of the WebSocketClient
export const client = new WebSocketClient();
