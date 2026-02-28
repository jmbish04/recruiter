/**
 * @file src/tools/index.ts
 * @description This file exports all the tool routes.
 * @owner AI-Builder
 */

import { OpenAPIHono } from '@hono/zod-openapi'
import files from './files'
import prs from './prs'
import issues from './issues'
import github from './github'
import kv from './kv'
import comments from './comments'
import healthCheck from './health'


const toolsApi = new OpenAPIHono<{ Bindings: Env }>()

toolsApi.route('/', files)
toolsApi.route('/', prs)
toolsApi.route('/', issues)
toolsApi.route('/', github)
toolsApi.route('/', kv)
toolsApi.route('/', comments)
toolsApi.route('/', healthCheck)

export const GITHUB_TOOLS = [];

export default toolsApi

/**
 * @extension_point
 * This is a good place to add new tool routes.
 * Just import the new tool and add a new `route` call.
 */
