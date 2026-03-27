import { HealthStepResult } from '@/health/types';
import { getAgentByName } from 'agents';

export async function checkHealth(env: Env): Promise<HealthStepResult> {
    const start = Date.now();
    
    // Define agents to probe - update these names/bindings as your agents evolve
    const agents = [
        { name: 'Orchestrator', binding: env.ORCHESTRATOR, instance: 'health-check-probe' },
        { name: 'Gemini Agent', binding: env.GEMINI_AGENT, instance: 'health-check-probe' },
        { name: 'Planner', binding: env.PLANNER, instance: 'health-check-probe' },
        { name: 'Supervisor', binding: env.SUPERVISOR, instance: 'health-check-probe' },
        { name: 'Deep Reasoning', binding: env.DEEP_REASONING_AGENT, instance: 'health-check-probe' }
    ];

    const agentResults: Record<string, any> = {};
    let failureCount = 0;

    for (const agent of agents) {
        if (!agent.binding) {
             agentResults[agent.name] = { status: "SKIPPED", reason: "Binding missing" };
             continue;
        }

        try {
            const getByName = getAgentByName as any;
            const stub = await getByName(agent.binding, agent.instance);
            
            let message = 'Healthy';
            const status = 'success';

            if (typeof stub.healthProbe === 'function') {
                const probe = await stub.healthProbe();
                const probeStatus = probe?.status || 'ok';
                message = `Healthy (${probeStatus})`;
            } else {
                // Backward compatibility for agents without callable health probes.
                const res = await stub.fetch('http://agent/health-probe');
                if (!(res.status >= 200 && res.status < 300)) {
                    throw new Error(`Unhealthy HTTP status (${res.status})`);
                }
                message = `Healthy (${res.status})`;
            }

            agentResults[agent.name] = { status: 'success', message };

        } catch (e: any) {
            failureCount++;
            agentResults[agent.name] = { 
                status: 'failure', 
                message: e.message,
                error: String(e)
            };
        }
    }

    const overallStatus = failureCount === 0 ? 'success' : 
                          failureCount === agents.length ? 'failure' : 'warning';

    return {
        name: 'Agents Ecosystem',
        status: overallStatus,
        message: `Agents: ${agents.length - failureCount}/${agents.length} operational`,
        durationMs: Date.now() - start,
        details: agentResults
    };
}
