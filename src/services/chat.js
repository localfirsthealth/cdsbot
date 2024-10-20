// services/cdsbot/src/services/chat.js

import ChatRoom from '../models/ChatRoom.js';
import ChatMessage from '../models/ChatMessage.js';
import { websocket } from '../utils/websocket.js';
import { createHttpError } from '../utils/errors.js';
import { getPatientProfile } from './patients.js';
import { replyToMessage } from './chat-replies.js';

export async function getAllChatRooms (query = {}) {
  const limit = parseInt(query.limit) || 50;
  const offset = parseInt(query.offset) || 0;

  if (limit <= 0) {
    throw createHttpError(400, 'Invalid limit parameter');
  }

  if (offset < 0) {
    throw createHttpError(400, 'Invalid offset parameter');
  }

  const rooms = await ChatRoom.find({}, null, {
    sort: { createdAt: -1 },
    skip: offset,
    limit,
  });

  const totalCount = await ChatRoom.count();

  return {
    items: rooms,
    pagination: {
      total: totalCount.total,
      offset,
      limit,
    },
  };
}

export async function getChatRoom (roomId) {
  if (!roomId) {
    throw createHttpError(400, 'roomId is required');
  }

  const room = await ChatRoom.findById(roomId);
  if (!room) {
    throw createHttpError(404, 'Chat room not found');
  }
  return room;
}

export async function createChatRoom (data = {}) {
  if (!data.patientId) {
    throw createHttpError(400, 'patientId is required');
  }

  if (!data.patientId) {
    throw createHttpError(400, 'patientId is required');
  }
  const patient = await getPatientProfile(data.patientId);
  if (!patient) {
    throw createHttpError(404, 'Patient not found');
  }

  // find room by patientId
  const room = await ChatRoom.findById(data.patientId);
  if (room) return room;

  const created = await ChatRoom.createOne({
    id: data.patientId,
    patientId: data.patientId,
    createdAt: new Date().toISOString(),
  });
  return created;
}

export async function getChatMessages (roomId, query = {}) {
  if (!roomId) {
    throw createHttpError(400, 'roomId is required');
  }

  const limit = parseInt(query.limit) || 50;
  const before = query.before ? new Date(query.before) : undefined;

  if (limit <= 0) {
    throw createHttpError(400, 'Invalid limit parameter');
  }

  const queryObj = { roomId };
  if (before && !isNaN(before.getTime())) {
    queryObj.timestamp = { $lt: before };
  }

  return ChatMessage.find(queryObj, null, {
    sort: { timestamp: -1 },
    limit,
  });
}

export async function sendChatMessage (roomId, data = {}) {
  // create a new chat room
  if (roomId && typeof roomId !== 'string') {
    const room = await createChatRoom(roomId);
    console.log('created room', room);
    roomId = room.id;
  }
  if (!roomId) {
    throw createHttpError(400, 'roomId is required');
  }

  // ensure the message text is valid
  if (!data.text || typeof data.text !== 'string' || data.text.trim().length === 0) {
    throw createHttpError(400, 'Invalid message text');
  }

  // ensure the sender is valid
  data.sender ||= 'user';
  if (!['user', 'bot'].includes(data.sender.toLowerCase())) {
    throw createHttpError(400, 'Invalid sender');
  }

  // ensure the chat room exists
  const room = await ChatRoom.findById(roomId);
  if (!room) {
    throw createHttpError(404, `Chat room not found: ${roomId}`);
  }

  // Create a new chat message
  const newMessage = await ChatMessage.createOne({
    createdAt: new Date().toISOString(),
    type: data.type || 'message',
    roomId,
    sender: data.sender || 'user',
    text: data.text,
    noreply: data.noreply ?? false,
    replyTo: data.replyTo || null,
    timestamp: new Date(),
    recommendations: data.recommendations || [],
  });

  // Broadcast the new message to the chat room if the Application instance is provided
  websocket.broadcast({
    type: 'chat/messages',
    event: 'created',
    data: newMessage,
  }, (connectionId, metadata) => metadata.roomId === roomId);

  // process the message for replies
  if (data.sender === 'user' && !data.noreply) {
    await replyToMessage(newMessage, { sendChatMessage });
  }

  return newMessage;
}
