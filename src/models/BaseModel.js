// services/cdsbot/src/models/BaseModel.js

import { v4 as uuidv4 } from 'https://jspm.dev/uuid';

class BaseModel {
  constructor (name, schema) {
    this.name = name;
    this.schema = schema;
    this.data = new Map();
  }

  async find (filter = {}) {
    return Array.from(this.data.values()).filter(item =>
      Object.entries(filter).every(([key, value]) => item[key] === value),
    );
  }

  async findOne (filter = {}) {
    return Array.from(this.data.values()).find(item =>
      Object.entries(filter).every(([key, value]) => item[key] === value),
    );
  }

  async findById (id) {
    return this.data.get(id);
  }

  async createOne (data) {
    const item = { ...data, createdAt: new Date(), updatedAt: new Date() };
    item.id ||= uuidv4();
    this.data.set(item.id, item);
    return item;
  }

  async updateOne (id, data) {
    const existingItem = this.data.get(id);
    if (!existingItem) {
      return null;
    }
    const updatedItem = { ...existingItem, ...data, updatedAt: new Date() };
    this.data.set(id, updatedItem);
    return updatedItem;
  }

  async deleteOne (id) {
    return this.data.delete(id);
  }

  async count (filter = {}) {
    const items = await this.find(filter);
    return items.length;
  }
}

export default BaseModel;
