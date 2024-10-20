// services/cdsbot/src/models/ChatRoom.js

import BaseModel from './BaseModel.js';

class ChatRoom extends BaseModel {
  constructor () {
    super('chat_rooms', {
      id: String,
      patientId: String,
      createdAt: String,
      createdBy: String,
      updatedBy: String,
      updatedAt: String,
    });
  }
}

export default new ChatRoom();
