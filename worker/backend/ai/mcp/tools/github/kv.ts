/**
 * @file src/tools/kv.ts
 * @description Tools for KV operations (e.g., saving comments).
 * @owner AI-Builder
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'


// --- Schemas ---

const SaveCommentsSchema = z.object({
    key: z.string().describe('Key to store comments under (e.g. repo-prNumber)'),
    comments: z.array(z.any()).describe('List of comments to store'),
})

const GetCommentsSchema = z.object({
    key: z.string().describe('Key to retrieve comments from'),
})

// --- Routes ---

const saveCommentsRoute = createRoute({
    method: 'post',
    path: '/kv/comments/save',
    operationId: 'saveCommentsToKv',
    description: 'Save comments to KV storage',
    request: {
        body: {
            content: { 'application/json': { schema: SaveCommentsSchema } }
        }
    },
    responses: {
        200: {
            description: 'Comments saved',
            content: { 'application/json': { schema: z.object({ success: z.boolean() }) } }
        }
    }
})

const getCommentsRoute = createRoute({
    method: 'get',
    path: '/kv/comments/get', // Using POST or GET with query? Tool calling usually simpler with POST bodies implies less parsing, but GET is standard for retrieval. Using GET with query param.
    operationId: 'getCommentsFromKv',
    description: 'Retrieve comments from KV storage',
    request: {
        query: GetCommentsSchema
    },
    responses: {
        200: {
            description: 'Retrieved comments',
            content: { 'application/json': { schema: z.array(z.any()) } }
        }
    }
})

// --- App ---

const app = new OpenAPIHono<{ Bindings: Env }>()

app.openapi(saveCommentsRoute, async (c) => {
    const { key, comments } = c.req.valid('json')

    // Use COMMENTS_KV
    await c.env.COMMENTS_KV.put(key, JSON.stringify(comments))

    return c.json({ success: true })
})

app.openapi(getCommentsRoute, async (c) => {
    const { key } = c.req.valid('query')

    const value = await c.env.COMMENTS_KV.get(key)
    const comments = value ? JSON.parse(value) : []

    return c.json(comments)
})

export default app
