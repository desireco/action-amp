import type { APIRoute } from 'astro';
import { openDB } from 'idb';
import type { ActionLog } from '../../../lib/types/action-log';

const DB_NAME = 'action-amp';
const DB_VERSION = 1;
const ACTION_LOGS_STORE = 'actionLogs';

const db = {
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

  async where(indexName: string, value: any) {
    const dbInstance = await this.init();
    const tx = dbInstance.transaction(ACTION_LOGS_STORE, 'readonly');
    const store = tx.objectStore(ACTION_LOGS_STORE);
    
    if (indexName) {
      const index = store.index(indexName);
      return index.getAll(value);
    }
    
    return store.getAll();
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  const { currentUser } = locals as any;
  const { visionId, type, content } = await request.json();
  
  if (!visionId || !type || !content) {
    return new Response(JSON.stringify({ error: 'Missing required fields' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const actionLog: ActionLog = {
    id: `action-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    visionId,
    type,
    content: content.trim(),
    timestamp: new Date().toISOString(),
    author: currentUser || 'User'
  };

  // Save to database
  await db.add(actionLog);

  return new Response(JSON.stringify({ success: true, actionLog }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};

export const GET: APIRoute = async ({ params, locals }) => {
  const { visionId } = params;
  const { currentUser } = locals as any;
  
  if (!visionId) {
    return new Response(JSON.stringify({ error: 'Missing visionId' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Fetch action logs for the vision
  const actionLogs = await db.where('visionId', visionId);

  return new Response(JSON.stringify({ actionLogs }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};