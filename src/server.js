// services/cdsbot/src/server.js

import { Application } from 'oak';
import { oakCors } from 'cors';
import { config } from './config.js';
import { websocket } from './utils/websocket.js';
import { client as wsclient } from './utils/websocket-client.js';
import { createErrorHandler } from './utils/errors.js';

// Import stub route files
import healthRoutes from './routes/health.js';
import chatRoutes from './routes/chat.js';

const app = new Application();

// Middleware
app.use(oakCors()); // Enable CORS for all routes
app.use(createErrorHandler());

// WebSocket setup
websocket.initialize(app);
wsclient.initialize(app);

// Mount the routes
healthRoutes(app);
chatRoutes(app);

// Start the server
console.log(`Server running on http://localhost:${config.port}`);
await app.listen({ port: config.port });
