import type { APIRoute } from 'astro';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createAPIRoute, parseRequestBody } from '../../../lib/api-handler';
import { ValidationError } from '../../../lib/errors';

export const POST: APIRoute = createAPIRoute(async ({ request }) => {
  const { taskId, content } = await parseRequestBody(request);

    if (!taskId || !content) {
      throw new ValidationError('Missing taskId or content');
    }

    // Parse the taskId to extract area, project, and filename
    const parts = taskId.split('/');
    if (parts.length < 3) {
      throw new ValidationError('Invalid taskId format');
    }

    const [area, project, filename] = parts;

    // Create the updates file path
    const updatesDir = path.join(process.cwd(), 'data/areas', area, project);
    const updatesPath = path.join(updatesDir, `${filename}.updates.json`);

    // Ensure the directory exists
    await fs.mkdir(updatesDir, { recursive: true });

    // Load existing updates
    let updates = [];
    try {
      const existingContent = await fs.readFile(updatesPath, 'utf-8');
      updates = JSON.parse(existingContent);
    } catch (error) {
      // File doesn't exist yet, start with empty array
      updates = [];
    }

    // Add the new update
    const newUpdate = {
      id: `update-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      content: content.trim(),
      timestamp: new Date().toISOString(),
      author: 'User' // Could be enhanced to track actual user
    };

    updates.push(newUpdate);

    // Save the updates back to the file
    await fs.writeFile(updatesPath, JSON.stringify(updates, null, 2), 'utf-8');

    return new Response(
      JSON.stringify({ success: true, update: newUpdate }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
});