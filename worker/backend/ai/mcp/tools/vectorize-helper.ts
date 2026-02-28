/**
 * @file src/ai/vectorize-helper.ts
 * @description Helper utilities for vectorizing code reviews and comments.
 * @owner AI-Builder
 */

import type { InferSelectModel } from "drizzle-orm";
import {
    codeReviewComments,
    codeReviewCommentEnrichments,
    repositories,
} from "@db/schema";

type CodeReviewComment = InferSelectModel<typeof codeReviewComments>;
type CodeReviewCommentEnrichment = InferSelectModel<typeof codeReviewCommentEnrichments>;
type Repository = InferSelectModel<typeof repositories>;

export interface VectorizableItem {
    id: string; // Composite ID: "comment:{id}" or "repo:{id}"
    text: string;
    metadata: Record<string, any>;
    timestamps: {
        created: string;
        updated?: string;
    }
}

/**
 * Flattens a code reivew comment + its context + enrichments into a single text block for embedding.
 */
export function flattenCommentForEmbedding(
    comment: CodeReviewComment,
    enrichments: CodeReviewCommentEnrichment[] = [],
    repoContext?: Partial<Repository>
): VectorizableItem {

    // 1. Construct Rich Text for Embedding
    // We prioritize the parts that are semantically meaningful for search:
    // - Summary & Category
    // - The code block (diff hunk or extracted code)
    // - The body markdown (problem description)
    // - Resolution notes (if fixed)

    const parts = [
        `[Category] ${comment.category || "General"}`,
        `[Priority] ${comment.priority || "Unknown"}`,
        `[Status] ${comment.status}`,
        comment.summary ? `[Summary] ${comment.summary}` : null,
        `[File] ${comment.filePath}:${comment.line}`,
        repoContext ? `[Repo] ${repoContext.name} (${repoContext.topicsJson})` : null,
        `[Body]\n${comment.bodyMarkdown}`,
        comment.mainSuggestionCode ? `[Suggestion]\n${comment.mainSuggestionCode}` : null,
        comment.diffHunk ? `[Diff]\n${comment.diffHunk}` : null,
        enrichments.length > 0 ? `[Enrichments]\n${enrichments.map(e => `${e.source}: ${e.responseSummary}`).join('\n')}` : null,
        comment.resolutionNotes ? `[Resolution] ${comment.resolutionNotes}` : null
    ];

    const textContent = parts.filter(Boolean).join('\n\n');

    return {
        id: `comment:${comment.id}`,
        text: textContent,
        metadata: {
            type: 'code_review_comment',
            repoId: comment.repoName ? `github:${comment.repoOwner}/${comment.repoName}` : 'unknown', // Best guess if not joined
            prNumber: comment.prNumber,
            author: comment.authorLogin,
            status: comment.status,
            category: comment.category,
            priority: comment.priority,
            hasSuggestion: !!comment.mainSuggestionCode
        },
        timestamps: {
            created: comment.createdAt,
            updated: comment.updatedAt || undefined
        }
    }
}
