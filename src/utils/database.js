// services/cdsbot/src/utils/database.js

// import { config } from '../config.js';

class Database {
  async connect () {
  }

  async close () {
  }

  async ping () {
    return { status: 'ok' };
  }
}

export const database = new Database();
