// services/cdsbot/src/routes/chat.js

import { Router } from 'oak';
import * as chatsvc from '../services/chat.js';
import recommendationssvc from '../services/recommendations.js';

const router = new Router();

/**
 * Get all available chat rooms
 * @route GET /chat/rooms
 * @param {Object} query
 * @param {number} [query.limit=50] - The maximum number of rooms to return
 * @param {number} [query.offset=0] - The number of rooms to skip (for pagination)
 * @returns {Array} List of chat rooms
 */
router.get('/chat/rooms', async (ctx) => {
  const query = ctx.request.query;
  const rooms = await chatsvc.getAllChatRooms(query);
  ctx.response.body = rooms;
});

/**
 * Get chat room details
 * @route GET /chat/rooms/:roomId
 * @param {string} roomId - The ID of the chat room
 * @returns {Object} Chat room details
 */
router.get('/chat/rooms/:roomId', async (ctx) => {
  const { roomId } = ctx.params;
  const room = await chatsvc.getChatRoom(roomId);
  ctx.response.body = room;
});

/**
 * Create a new chat room
 * @route POST /chat/rooms
 * @param {Object} requestBody
 * @param {string} requestBody.patientId - The ID of the patient for whom to create the chat room
 * @returns {Object} Newly created chat room details
 */
router.post('/chat/rooms', async (ctx) => {
  const body = await ctx.request.body().value;
  const newRoom = await chatsvc.createChatRoom(body);
  ctx.response.status = 201;
  ctx.response.body = newRoom;
});

/**
 * Get chat messages for a room
 * @route GET /chat/rooms/:roomId/messages
 * @param {string} roomId - The ID of the chat room
 * @param {Object} query
 * @param {number} [query.limit=50] - The maximum number of messages to return
 * @param {string} [query.before] - Timestamp to fetch messages before (for pagination)
 * @returns {Array} List of chat messages
 */
router.get('/chat/rooms/:roomId/messages', async (ctx) => {
  const { roomId } = ctx.params;
  const query = ctx.request.query;
  const messages = await chatsvc.getChatMessages(roomId, query);
  ctx.response.body = messages;
});

/**
 * Send a new message in a chat room
 * @route POST /chat/rooms/:roomId/messages
 * @param {string} roomId - The ID of the chat room
 * @param {Object} requestBody
 * @param {string} requestBody.content - The content of the message
 * @param {string} requestBody.sender - The sender of the message ('user' or 'bot')
 * @returns {Object} Newly created message details
 */
router.post('/chat/rooms/:roomId/messages', async (ctx) => {
  const { roomId } = ctx.params;
  const body = await ctx.request.body().value;
  const newMessage = await chatsvc.sendChatMessage(roomId, body);
  ctx.response.status = 201;
  ctx.response.body = newMessage;
});

export default function configure (app) {
  // Add the routes to the app
  app.use(router.routes());
  app.use(router.allowedMethods());

  // react to chat room events
  app.wss.registerHandler('chat/rooms', async (connId, event) => {
    try {
      switch (event.action) {
        case 'subscribe': {
          // ensure the room
          const room = await chatsvc.createChatRoom(event.data);
          app.wss.sendTo(connId, {
            type: 'chat/rooms',
            event: 'subscribed',
            data: room,
          });

          // register the room to the connection's metadata
          app.wss.setMetadata(connId, 'roomId', room.id);

          // send the initial messages for the room
          const messages = await chatsvc.getChatMessages(room.id, { limit: 50 });
          app.wss.sendTo(connId, {
            type: 'chat/messages',
            event: 'listed',
            data: messages,
          });

          // start monitoring the room's patient's medical-records to trigger recommendations generation
          await recommendationssvc.generateRecommendationsForPatient(room.patientId, {
            timeout: 30000, // 30 seconds
            shouldContinue: () => app.wss.isConnectionOpen(connId),
          });

          break;
        }
      }
    } catch (error) {
      console.error('Error processing chat room event:', error);
      app.wss.sendTo(connId, {
        type: 'chat/rooms',
        event: 'error',
        data: { message: error.message },
      });
    }
  });

  // react to chat message events
  app.wss.registerHandler('chat/messages', async (connId, event) => {
    try {
      switch (event.action) {
        case 'list': {
          const messages = await chatsvc.getChatMessages(event.data?.roomId, event.query);
          app.wss.sendTo(connId, {
            type: 'chat/messages',
            event: 'listed',
            data: messages,
          });
          break;
        }
        case 'create': {
          const created = await chatsvc.sendChatMessage(event.data?.roomId, event.data);

          // register the room to the connection's metadata
          app.wss.setMetadata(connId, 'roomId', created.roomId);

          // start monitoring the room's patient's medical-records to trigger recommendations generation
          await recommendationssvc.generateRecommendationsForPatient(created.roomId, {
            timeout: 30000, // 30 seconds
            shouldContinue: () => app.wss.isConnectionOpen(connId),
          });
          break;
        }
      }
    } catch (error) {
      console.error('Error processing chat message event:', error);
      app.wss.sendTo(connId, {
        type: 'chat/messages',
        event: 'error',
        data: { message: error.message },
      });
    }
  });
}
