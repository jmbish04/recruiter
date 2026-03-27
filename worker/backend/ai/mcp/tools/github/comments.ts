
/**
 * @file src/tools/comments.ts
 * @description Tools for extracting and managing PR comments.
 * @owner AI-Builder
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { getOctokit } from '@services/octokit/core'


// --- Schemas ---

const ExtractCommentsRequestSchema = z.object({
    owner: z.string(),
    repo: z.string(),
    pull_number: z.number(),
})

const ExtractedCommentSchema = z.object({
    id: z.number(),
    path: z.string(),
    line: z.number().nullable(),
    start_line: z.number().nullable().optional(),
    original_line: z.number().nullable().optional(), // For older comments
    body: z.string(),
    diff_hunk: z.string().optional(),
    suggestion: z.string().optional(), // We'll try to parse this from the body if possible, or if GitHub provides it
    user: z.object({
        login: z.string(),
        avatar_url: z.string(),
    }),
    created_at: z.string(),
    html_url: z.string(),
})

const ExtractCommentsResponseSchema = z.object({
    success: z.boolean(),
    count: z.number(),
    view_url: z.string(),
    extraction_id: z.string(),
    error: z.string().optional(),
})

const GetCommentsResponseSchema = z.array(ExtractedCommentSchema)

// --- Routes ---

const extractRoute = createRoute({
    method: 'post',
    path: '/comments/extract',
    operationId: 'extractPrComments',
    request: {
        body: {
            content: {
                'application/json': {
                    schema: ExtractCommentsRequestSchema,
                },
            },
        },
    },
    responses: {
        200: {
            content: {
                'application/json': {
                    schema: ExtractCommentsResponseSchema,
                },
            },
            description: 'Comments extracted successfully.',
        },
        500: {
            content: {
                'application/json': {
                    schema: ExtractCommentsResponseSchema,
                },
            },
            description: 'Extraction failed.',
        },
    },
    'x-agent': true,
    description: 'Extracts code comments from a PR, stores them, and posts a link on the PR.',
})

const getCommentsRoute = createRoute({
    method: 'get',
    path: '/comments/:id',
    operationId: 'getStoredComments',
    request: {
        params: z.object({
            id: z.string(),
        })
    },
    responses: {
        200: {
            content: {
                'application/json': {
                    schema: GetCommentsResponseSchema,
                },
            },
            description: 'Retrieve stored comments.',
        },
        404: {
            description: 'Comments not found',
        }
    },
    description: 'Public endpoint to retrieve stored comments for the viewer.',
})

const getCommentsByPrRoute = createRoute({
    method: 'get',
    path: '/comments/:owner/:repo/:number',
    operationId: 'getCommentsByPr',
    request: {
        params: z.object({
            owner: z.string(),
            repo: z.string(),
            number: z.string(),
        })
    },
    responses: {
        200: {
            content: {
                'application/json': {
                    schema: GetCommentsResponseSchema,
                },
            },
            description: 'Retrieve latest extracted comments for PR.',
        },
        404: {
            description: 'Comments not found',
        }
    },
    description: 'Retrieve latest extracted comments for a specific PR.',
})

// --- Handler ---

const commentsTools = new OpenAPIHono<{ Bindings: Env }>()

commentsTools.openapi(extractRoute, async (c) => {
    const { owner, repo, pull_number } = c.req.valid('json')
    const octokit = await getOctokit(c.env)

    // 1. Fetch Review Comments
    let reviewComments;
    try {
        const result = await octokit.pulls.listReviewComments({
            owner,
            repo,
            pull_number,
        })
        reviewComments = result.data;
    } catch (error: any) {
        console.error(`[comments] Failed to list review comments: ${error.message}`);
        // Return success: false but structured to avoid crashing the runner
        return c.json({
            success: false,
            count: 0,
            view_url: '',
            extraction_id: '',
            error: error.message
        }, 500)
    }

    // 2. Process Comments
    const extractedComments = reviewComments.map(comment => {
        // Check for suggestion in body (GitHub suggestions use ```suggestion block)
        const suggestionMatch = comment.body.match(/```suggestion\r?\n([\s\S]*?)\r?\n```/)
        const suggestion = suggestionMatch ? suggestionMatch[1] : undefined

        return {
            id: comment.id,
            path: comment.path,
            line: comment.line, // The line of the comment
            start_line: comment.start_line, // If multi-line
            original_line: comment.original_line,
            // Strip Gemini Code Assist priority badges (e.g., ![high](https://www.gstatic.com/codereviewagent/high-priority.svg))
            body: comment.body.replace(/!\[.*?\]\(https:\/\/www\.gstatic\.com\/codereviewagent\/.*?-priority\.svg\)/g, '').trim(),
            diff_hunk: comment.diff_hunk,
            suggestion,
            user: {
                login: comment.user.login,
                avatar_url: comment.user.avatar_url,
            },
            created_at: comment.created_at,
            html_url: comment.html_url
        }
    })

    // 3. Store in KV
    const extractionId = `${owner}-${repo}-${pull_number}-${Date.now()}`
    // Using a simpler ID for public URL but including enough entropy or PR details
    // For safety, maybe just a UUID? But for now let's use a readable ID.
    const storageKey = `COMMENTS_${extractionId}`

    await c.env.COMMENTS_KV.put(storageKey, JSON.stringify(extractedComments), {
        expirationTtl: 60 * 60 * 24 * 30 // 30 days
    })

    // 4. Construct Public URL
    // Assuming the frontend is served from the same origin
    const origin = new URL(c.req.url).origin
    const viewUrl = `${origin}/view-comments/${extractionId}`

    // 5. Post URL to PR
    await octokit.issues.createComment({
        owner,
        repo,
        issue_number: pull_number,
        body: `### ✨ Code Comments Extracted\n\nI have extracted **${extractedComments.length}** code comments for easier triage.\n\n[**View Extracted Comments**](${origin}/view-comments/${owner}/${repo}/pull/${pull_number})`
    })

    return c.json({
        success: true,
        count: extractedComments.length,
        view_url: viewUrl,
        extraction_id: extractionId
    })
})

commentsTools.openapi(getCommentsRoute, async (c) => {
    const { id } = c.req.valid('param')
    const comments = await c.env.COMMENTS_KV.get(`COMMENTS_${id}`, 'json')

    if (!comments) {
        return c.json({ error: 'Comments not found' }, 404)
    }

    return c.json(comments as z.infer<typeof GetCommentsResponseSchema>)
})

commentsTools.openapi(getCommentsByPrRoute, async (c) => {
    const { owner, repo, number } = c.req.valid('param')
    
    // KV List to find the latest extraction for this PR
    // Prefix: COMMENTS_owner-repo-number-
    const prefix = `COMMENTS_${owner}-${repo}-${number}-`
    const list = await c.env.COMMENTS_KV.list({ prefix, limit: 1 })
    
    if (!list.keys.length) {
        return c.json({ error: 'No extracted comments found for this PR' }, 404)
    }

    // Keys are sorted, so the first one (or last depending on sort?)
    // Actually KV list order isn't strictly guaranteed to be reverse chronological by default unless we structured keys that way.
    // Our keys are `...-${Date.now()}`.
    // We should list all and sort, or reverse?
    // Let's list a few and pick the latest.
    // But since Date.now() is at the end, standard lexicographical sort might not give us latest first instantly.
    // Actually, `COMMENTS_owner-repo-number-timestamp`. 
    // If timestamp is fixed length, it sorts. But it varies.
    // Let's just grab the last key if we list them all? limiting to 1 with prefix might give the "start" which is oldest if lex sorted.
    
    // Better strategy: just fetch the list, sort keys in code, get latest.
    const allKeys = await c.env.COMMENTS_KV.list({ prefix })
    if (!allKeys.keys.length) {
         return c.json({ error: 'No extracted comments found for this PR' }, 404)
    }
    
    // Sort keys by timestamp suffix descending
    const sortedKeys = allKeys.keys.sort((a, b) => {
        const timeA = parseInt(a.name.split('-').pop() || '0')
        const timeB = parseInt(b.name.split('-').pop() || '0')
        return timeB - timeA
    })
    
    const latestKey = sortedKeys[0].name
    const comments = await c.env.COMMENTS_KV.get(latestKey, 'json')
    
    if (!comments) {
        return c.json({ error: 'Comments data missing' }, 404)
    }

    return c.json(comments as z.infer<typeof GetCommentsResponseSchema>)
})

export default commentsTools
