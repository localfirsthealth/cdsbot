// services/cdsbot/src/models/ChatMessage.js

import BaseModel from './BaseModel.js';

class ChatMessage extends BaseModel {
  constructor () {
    super('chat_messages', {
      id: String,
      createdAt: String,
      createdBy: String,
      updatedAt: String,
      updatedBy: String,
      type: String, // message | recommendations | summary
      roomId: String,
      sender: String, // bot | user
      senderId: String,
      text: String,
      noreply: Boolean, // messages that don't require a reply
      replyTo: String, // id of the message being replied to
      // for recommendations
      recommendations: Array,
      // recommendations: {
      //   medicalRecordId: String,
      //   text: String,
      //   urgency: String,
      //   confidence: Number,
      //   timestamp: String,
      //   triggerEvent: String,
      // },
    });
  }
}

export default new ChatMessage();
