/**
 * @file src/tools/prs.ts
 * @description This file contains the implementation of the open pull request tool.
 * @owner AI-Builder
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { getOctokit } from '@services/octokit/core'
import { DEFAULT_TEMPLATE_REPO, DEFAULT_GITHUB_OWNER } from "@github-utils";


// --- 1. Zod Schema Definitions ---

const OpenPrRequestSchema = z.object({
  owner: z.string().default(DEFAULT_GITHUB_OWNER).openapi({ example: 'octocat' }),
  repo: z.string().openapi({ example: 'Hello-World' }),
  head: z.string().openapi({ example: 'feature-branch' }),
  base: z.string().openapi({ example: 'main' }),
  title: z.string().openapi({ example: 'feat: new feature' }),
  body: z.string().optional().openapi({ example: 'This PR adds a new feature.' }),
})


const OpenPrResponseSchema = z.object({
  id: z.number(),
  number: z.number(),
  html_url: z.string().url(),
  state: z.string(),
  title: z.string(),
  body: z.string().nullable(),
})

// --- 2. Route Definition ---

const openPrRoute = createRoute({
  method: 'post',
  path: '/prs/open',
  operationId: 'openPullRequest',
  request: {
    body: {
      content: {
        'application/json': {
          schema: OpenPrRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: OpenPrResponseSchema,
        },
      },
      description: 'Pull request opened successfully.',
    },
  },
  'x-agent': true,
  description: 'Open a new pull request in a GitHub repository.',
})

// --- 3. Hono App and Handler ---

const prs = new OpenAPIHono<{ Bindings: Env }>()

prs.openapi(openPrRoute, async (c) => {
  const { owner, repo, head, base, title, body } = c.req.valid('json')
  const octokit = await getOctokit(c.env)

  const { data } = await octokit.pulls.create({
    owner,
    repo,
    head,
    base,
    title,
    body,
  })

  const response: z.infer<typeof OpenPrResponseSchema> = {
    id: data.id,
    number: data.number,
    html_url: data.html_url,
    state: data.state,
    title: data.title,
    body: data.body,
  }

  return c.json(response)
  return c.json(response)
})

// --- Comment Schemas ---

const ListCommentsSchema = z.object({
  owner: z.string().default(DEFAULT_GITHUB_OWNER),

  repo: z.string(),
  number: z.string().transform(n => parseInt(n, 10)),
})

const CreateCommentSchema = z.object({
  owner: z.string().default(DEFAULT_GITHUB_OWNER),

  repo: z.string(),
  number: z.number(),
  body: z.string(),
  path: z.string().optional(),
  line: z.number().optional(),
})

// --- Comment Routes ---

const listCommentsRoute = createRoute({
  method: 'get',
  path: '/prs/comments/list',
  operationId: 'listPrComments',
  request: {
    query: ListCommentsSchema
  },
  responses: {
    200: {
      content: { 'application/json': { schema: z.array(z.any()) } },
      description: 'List of PR comments'
    }
  }
})

const createCommentRoute = createRoute({
  method: 'post',
  path: '/prs/comments/create',
  operationId: 'createPrComment',
  request: {
    body: { content: { 'application/json': { schema: CreateCommentSchema } } }
  },
  responses: {
    200: {
      content: { 'application/json': { schema: z.any() } },
      description: 'Comment created'
    }
  }
})

// --- Handlers ---

prs.openapi(listCommentsRoute, async (c) => {
  const { owner, repo, number } = c.req.valid('query')
  const octokit = await getOctokit(c.env)

  // Fetch both issue comments (general) and review comments (code)
  const [issueComments, reviewComments] = await Promise.all([
    octokit.issues.listComments({ owner, repo, issue_number: number }),
    octokit.pulls.listReviewComments({ owner, repo, pull_number: number })
  ])

  // Combine and sort by date
  const allComments = [
    ...issueComments.data.map((C: any) => ({ ...C, type: 'issue' })),
    ...reviewComments.data.map((C: any) => ({ ...C, type: 'review' }))
  ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

  return c.json(allComments)
})

prs.openapi(createCommentRoute, async (c) => {
  const { owner, repo, number, body, path, line } = c.req.valid('json')
  const octokit = await getOctokit(c.env)

  let data;
  if (path && line) {
    // Create review comment
    // Note: This requires the PR to have a pending review or we create a new one. 
    // Simply creating a comment on a line usually requires the latest commit_id or interaction with a review.
    // For simplicity, we'll try createReviewComment but it might fail if commit_id isn't provided.
    // Most robust way for tools is usually just "comment on the PR" unless we have full context.
    // Let's try fetching the PR to get the head sha.
    const { data: pr } = await octokit.pulls.get({ owner, repo, pull_number: number })
    const res = await octokit.pulls.createReviewComment({
      owner,
      repo,
      pull_number: number,
      body,
      path,
      line,
      commit_id: pr.head.sha
    })
    data = res.data
  } else {
    // General issue comment
    const res = await octokit.issues.createComment({
      owner,
      repo,
      issue_number: number,
      body
    })
    data = res.data
  }

  return c.json(data)
})

export default prs

/**
 * @extension_point
 * This is a good place to add other PR-related tools,
 * such as listing, merging, or closing pull requests.
 */
