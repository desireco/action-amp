import { openDB } from 'idb';
import { ActionLog } from '../types/action-log';

const DB_NAME = 'action-amp';
const DB_VERSION = 1;
const ACTION_LOGS_STORE = 'actionLogs';

export const db = {
  async init() {
    return openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(ACTION_LOGS_STORE)) {
          db.createObjectStore(ACTION_LOGS_STORE, { keyPath: 'id' });
        }
      }
    });
  },

  async add(actionLog: ActionLog) {
    const dbInstance = await this.init();
    return dbInstance.add(ACTION_LOGS_STORE, actionLog);
  },

  async get(id: string) {
    const dbInstance = await this.init();
    return dbInstance.get(ACTION_LOGS_STORE, id);
  },

  async where(indexName: string, value: any) {
    const dbInstance = await this.init();
    const tx = dbInstance.transaction(ACTION_LOGS_STORE, 'readonly');
    const store = tx.objectStore(ACTION_LOGS_STORE);
    
    if (indexName) {
      const index = store.index(indexName);
      return index.getAll(value);
    }
    
    return store.getAll();
  },

  async getAll() {
    const dbInstance = await this.init();
    return dbInstance.getAll(ACTION_LOGS_STORE);
  }
};

// Initialize database
db.init();