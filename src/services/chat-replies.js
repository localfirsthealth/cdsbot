// services/cdsbot/src/services/chat-replies.js

import { cancelRunningTasks } from '../utils/task-manager.js';
import ChatMessage from '../models/ChatMessage.js';
import { generateBotReply } from './chat-bot.js';
import { websocket } from '../utils/websocket.js';

const botReplyWorkers = new Map();

export async function replyToMessage (message, opts) {
  const sendChatMessage = opts?.sendChatMessage || (() => undefined);

  if (typeof message === 'string') message = await ChatMessage.findById(message);

  const roomId = message.roomId;

  // Cancel any existing bot reply process for this room
  if (botReplyWorkers.has(roomId)) {
    await cancelRunningTasks(botReplyWorkers.get(roomId));
  }

  // Create a new bot reply process
  const replyProcess = async () => {
    try {
      console.log('Generating bot reply for message:', message.text, 'in', roomId);

      // Send bot status
      websocket.broadcast({
        type: 'chat/bot',
        event: 'generating-reply',
        data: { roomId, message: message.id },
      }, (connectionId, metadata) => metadata.roomId === roomId);

      const botReply = await generateBotReply(message);
      console.log('Generated bot reply:', botReply);

      // Send bot status
      websocket.broadcast({
        type: 'chat/bot',
        event: 'idle',
        data: { roomId, activity: 'generating-reply', message: message.id },
      }, (connectionId, metadata) => metadata.roomId === roomId);

      await sendChatMessage(roomId, {
        ...botReply,
        sender: 'bot',
        type: 'message',
      });
    } catch (error) {
      console.error('Failed to generate bot reply:', error);

      // Send bot status
      websocket.broadcast({
        type: 'chat/bot',
        event: 'idle',
        data: {
          roomId,
          activity: 'generating-reply',
          error: error.message || 'Failed to generate bot reply',
          message: message.id,
        },
      }, (connectionId, metadata) => metadata.roomId === roomId);

      await sendChatMessage(roomId, {
        sender: 'bot',
        type: 'message',
        text: 'Sorry, I encountered an error while processing your message. Please try again.',
        noreply: true,
      });
    } finally {
      botReplyWorkers.delete(roomId);
    }
  };

  // Start the new process and store its cancellation function
  const cancellationFunction = cancelRunningTasks(replyProcess());
  botReplyWorkers.set(roomId, cancellationFunction);
}
