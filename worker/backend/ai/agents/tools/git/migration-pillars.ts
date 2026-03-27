import { MigrationPillar, DetailedQuestion } from "../types";

/**
 * Define the core Cloudflare Workers migration pillars
 * These represent the key areas to evaluate when migrating to Cloudflare Workers
 */
export const MIGRATION_PILLARS: Omit<MigrationPillar, 'questions' | 'status' | 'findings' | 'progress'>[] = [
  {
    id: 'frontend',
    name: 'Frontend & SSR',
    description: 'React, Vue, SSR frameworks, static site generation',
    icon: '🎨',
    category: 'frontend',
    bindings: ['Pages', 'Workers', 'R2'],
  },
  {
    id: 'compute',
    name: 'Compute & Runtime',
    description: 'Node.js compatibility, V8 isolates, edge computing',
    icon: '⚡',
    category: 'compute',
    bindings: ['Workers', 'Durable Objects'],
  },
  {
    id: 'storage',
    name: 'Storage & Databases',
    description: 'D1, R2, KV, Durable Objects storage',
    icon: '💾',
    category: 'storage',
    bindings: ['D1', 'R2', 'KV', 'Durable Objects'],
  },
  {
    id: 'networking',
    name: 'Networking & APIs',
    description: 'API routes, edge functions, request handling',
    icon: '🌐',
    category: 'networking',
    bindings: ['Workers', 'Pages Functions'],
  },
  {
    id: 'ai-ml',
    name: 'AI & Machine Learning',
    description: 'Workers AI, Vectorize, AI Gateway',
    icon: '🤖',
    category: 'compute',
    bindings: ['AI', 'Vectorize', 'Workers AI'],
  },
  {
    id: 'security',
    name: 'Security & Auth',
    description: 'Authentication, secrets, WAF, Zero Trust',
    icon: '🔒',
    category: 'security',
    bindings: ['Secrets', 'Access', 'WAF'],
  },
  {
    id: 'observability',
    name: 'Observability & Logging',
    description: 'Analytics, logging, monitoring, debugging',
    icon: '📊',
    category: 'observability',
    bindings: ['Analytics', 'Logs', 'Trace'],
  },
];

/**
 * Map bindings to pillars
 */
export function getPillarsForBindings(bindings: string[]): string[] {
  const pillarIds: string[] = [];

  for (const binding of bindings) {
    for (const pillar of MIGRATION_PILLARS) {
      if (pillar.bindings.some((b: string) =>
        b.toLowerCase().includes(binding.toLowerCase()) ||
        binding.toLowerCase().includes(b.toLowerCase())
      )) {
        if (!pillarIds.includes(pillar.id)) {
          pillarIds.push(pillar.id);
        }
      }
    }
  }

  return pillarIds;
}

/**
 * Categorize a question into pillars based on its bindings and tags
 */
export function categorizeQuestion(question: DetailedQuestion): string[] {
  const pillarIds: string[] = [];

  // Check bindings
  const bindingPillars = getPillarsForBindings(question.cloudflare_bindings_involved);
  pillarIds.push(...bindingPillars);

  // Check tags for additional context
  const tagMap: Record<string, string> = {
    'react': 'frontend',
    'vue': 'frontend',
    'ssr': 'frontend',
    'nextjs': 'frontend',
    'nuxt': 'frontend',
    'database': 'storage',
    'db': 'storage',
    'postgres': 'storage',
    'mysql': 'storage',
    'redis': 'storage',
    'cache': 'storage',
    'api': 'networking',
    'rest': 'networking',
    'graphql': 'networking',
    'auth': 'security',
    'authentication': 'security',
    'logging': 'observability',
    'monitoring': 'observability',
  };

  for (const tag of question.tags) {
    const mappedPillar = tagMap[tag.toLowerCase()];
    if (mappedPillar && !pillarIds.includes(mappedPillar)) {
      pillarIds.push(mappedPillar);
    }
  }

  // If no pillars found, default to compute
  if (pillarIds.length === 0) {
    pillarIds.push('compute');
  }

  return pillarIds;
}

/**
 * Create initial migration plan structure
 */
export function createMigrationPlan(owner: string, repo: string): MigrationPillar[] {
  return MIGRATION_PILLARS.map(pillar => ({
    ...pillar,
    questions: [],
    status: 'pending' as const,
    findings: [],
    progress: 0,
  }));
}


