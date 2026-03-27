/**
 * @file src/tools/files.ts
 * @description This file contains the implementation of the file upsert tool.
 * @owner AI-Builder
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { getOctokit } from '@services/octokit/core'
import { encode } from '@utils/base64'
import { DEFAULT_TEMPLATE_REPO, DEFAULT_GITHUB_OWNER } from "@github-utils";


// --- 1. Zod Schema Definitions ---

const UpsertFileRequestSchema = z.object({
  owner: z.string().default(DEFAULT_GITHUB_OWNER).openapi({ example: 'octocat' }),
  repo: z.string().openapi({ example: 'Hello-World' }),
  path: z.string().openapi({ example: 'test.txt' }),
  content: z.string().openapi({ example: 'Hello, world!' }),
  message: z.string().openapi({ example: 'feat: add test.txt' }),
  sha: z.string().optional().openapi({ example: '95b966ae1c166bd92f8ae7d1c313e738c731dfc3' }),
})

const UpsertFileResponseSchema = z.object({
  content: z.object({
    name: z.string(),
    path: z.string(),
    sha: z.string(),
    size: z.number(),
    url: z.string().url(),
    html_url: z.string().url(),
    git_url: z.string().url(),
    download_url: z.string().url().nullable(),
    type: z.string(),
  }),
  commit: z.object({
    sha: z.string(),
    url: z.string().url(),
    html_url: z.string().url(),
    message: z.string(),
  }),
})

const ListRepoTreeRequestSchema = z.object({
  owner: z.string().default(DEFAULT_GITHUB_OWNER).openapi({ example: 'octocat' }),
  repo: z.string().openapi({ example: 'Hello-World' }),
  ref: z
    .string()
    .optional()
    .openapi({ example: 'main', description: 'Git reference (branch, tag, or commit SHA). Defaults to HEAD.' }),
  path: z
    .string()
    .optional()
    .openapi({ example: 'src', description: 'Restrict the listing to a specific directory path.' }),
  recursive: z
    .boolean()
    .optional()
    .openapi({ example: true, description: 'When true, retrieves the full tree recursively.' }),
})

const TreeEntrySchema = z.object({
  path: z.string(),
  type: z.string(),
  mode: z.string(),
  sha: z.string(),
  size: z.number().nullable(),
  url: z.string().url().nullable(),
  depth: z.number().int().min(0),
  displayPath: z.string(),
})

const ListRepoTreeResponseSchema = z.object({
  entries: z.array(TreeEntrySchema),
  listing: z.string(),
  truncated: z.boolean(),
})

// --- 2. Route Definition ---

const upsertFileRoute = createRoute({
  method: 'post',
  path: '/files/upsert',
  operationId: 'upsertFile',
  request: {
    body: {
      content: {
        'application/json': {
          schema: UpsertFileRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: UpsertFileResponseSchema,
        },
      },
      description: 'File created or updated successfully.',
    },
  },
  'x-agent': true,
  description: 'Create or update a file in a GitHub repository.',
})

// --- 3. Hono App and Handler ---

const files = new OpenAPIHono<{ Bindings: Env }>()

files.openapi(upsertFileRoute, async (c) => {
  const { owner, repo, path, content, message, sha } = c.req.valid('json')
  const octokit = await getOctokit(c.env)

  const { data } = await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path,
    message,
    content: encode(content),
    sha,
  })

  // The response from Octokit is more verbose than our schema, so we need to map it.
  const response: z.infer<typeof UpsertFileResponseSchema> = {
    content: {
      name: data.content!.name ?? '',
      path: data.content!.path ?? '',
      sha: data.content!.sha ?? '',
      size: data.content!.size ?? 0,
      url: data.content!.url ?? '',
      html_url: data.content!.html_url ?? '',
      git_url: data.content!.git_url ?? '',
      download_url: data.content!.download_url ?? null,
      type: data.content!.type ?? '',
    },
    commit: {
      sha: data.commit.sha!,
      url: data.commit.url ?? '',
      html_url: data.commit.html_url ?? '',
      message: data.commit.message ?? '',
    },
  }

  return c.json(response)
})

const listRepoTreeRoute = createRoute({
  method: 'post',
  path: '/files/tree',
  operationId: 'listRepoTree',
  request: {
    body: {
      content: {
        'application/json': {
          schema: ListRepoTreeRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ListRepoTreeResponseSchema,
        },
      },
      description: 'Repository tree retrieved successfully.',
    },
  },
  'x-agent': true,
  description: 'List repository contents with an ls-style tree representation.',
})

files.openapi(listRepoTreeRoute, async (c) => {
  const { owner, repo, ref, path, recursive } = c.req.valid('json')
  const octokit = await getOctokit(c.env)

  const treeSha = ref ?? 'HEAD'
  const recursiveFlag = recursive ?? true

  const { data } = await octokit.git.getTree({
    owner,
    repo,
    tree_sha: treeSha,
    recursive: recursiveFlag ? '1' : undefined,
  })

  const normalizedPath = path?.replace(/^\/+|\/+$/g, '')

  const filteredTree = normalizedPath
    ? data.tree.filter((entry) => {
      if (!entry.path) {
        return false
      }

      return entry.path === normalizedPath || entry.path.startsWith(`${normalizedPath}/`)
    })
    : data.tree

  const sortedEntries = [...filteredTree].sort((a, b) => {
    const pathA = a.path ?? ''
    const pathB = b.path ?? ''
    return pathA.localeCompare(pathB)
  })

  const formattedEntries = sortedEntries.map((entry) => {
    const pathValue = entry.path ?? ''
    const segments = (() => {
      if (!pathValue) {
        return [] as string[]
      }

      if (!normalizedPath) {
        return pathValue.split('/').filter(Boolean)
      }

      if (pathValue === normalizedPath) {
        return [] as string[]
      }

      if (pathValue.startsWith(`${normalizedPath}/`)) {
        return pathValue
          .slice(normalizedPath.length + 1)
          .split('/')
          .filter(Boolean)
      }

      return pathValue.split('/').filter(Boolean)
    })()

    const relativeDepth = normalizedPath
      ? segments.length
      : Math.max(0, segments.length - 1)

    const indent = '  '.repeat(relativeDepth)
    const suffix = entry.type === 'tree' ? '/' : ''

    const displayPath = normalizedPath && pathValue === normalizedPath
      ? './'
      : segments.length === 0
        ? (pathValue || './') + suffix
        : `${indent}${segments[segments.length - 1]}${suffix}`

    return {
      path: pathValue,
      type: entry.type ?? 'blob',
      mode: entry.mode ?? '',
      sha: entry.sha ?? '',
      size: typeof entry.size === 'number' ? entry.size : null,
      url: entry.url ?? null,
      depth: relativeDepth,
      displayPath,
    }
  })

  const header = 'MODE     TYPE   SIZE      SHA                                      PATH'
  const listingLines = formattedEntries.map((entry) => {
    const sizeValue = entry.size === null ? '-' : entry.size.toString()
    return `${entry.mode.padEnd(8)} ${entry.type.padEnd(5)} ${sizeValue.padStart(8)} ${entry.sha} ${entry.displayPath}`
  })

  const listing = [header, ...listingLines].join('\n')

  return c.json({
    entries: formattedEntries,
    listing,
    truncated: data.truncated ?? false,
  })
})

export default files

/**
 * @extension_point
 * This is a good place to add other file-related tools,
 * such as reading, deleting, or listing files.
 */
