/**
 * Server-Sent Events (SSE) utility for streaming progress updates
 */

export interface StreamEvent {
  type: 'progress' | 'data' | 'error' | 'complete' | 'plan' | 'pillar_start' | 'pillar_progress' | 'pillar_complete';
  message?: string;
  data?: any;
  timestamp?: string;
  pillar_id?: string;
  pillar_name?: string;
}

/**
 * Create a Server-Sent Events stream
 */
export function createSSEStream() {
  let controller: ReadableStreamDefaultController;

  const stream = new ReadableStream({
    start(ctrl) {
      controller = ctrl;
    },
  });

  return {
    stream,
    send(event: StreamEvent) {
      const timestamp = new Date().toISOString();
      const data = JSON.stringify({ ...event, timestamp });
      const message = `data: ${data}\n\n`;
      controller.enqueue(new TextEncoder().encode(message));
    },
    sendProgress(message: string) {
      this.send({ type: 'progress', message });
    },
    sendData(data: any, message?: string) {
      this.send({ type: 'data', data, message });
    },
    sendError(error: string | Error) {
      const message = error instanceof Error ? error.message : error;
      this.send({ type: 'error', message });
    },
    complete(data?: any) {
      if (data) {
        this.send({ type: 'complete', data });
      } else {
        this.send({ type: 'complete', message: 'Stream completed' });
      }
      controller.close();
    },
    sendPlan(plan: any) {
      this.send({ type: 'plan', data: plan });
    },
    sendPillarStart(pillarId: string, pillarName: string, message?: string) {
      this.send({ type: 'pillar_start', pillar_id: pillarId, pillar_name: pillarName, message });
    },
    sendPillarProgress(pillarId: string, pillarName: string, progress: number, message?: string) {
      this.send({ type: 'pillar_progress', pillar_id: pillarId, pillar_name: pillarName, data: { progress }, message });
    },
    sendPillarComplete(pillarId: string, pillarName: string, findings: string[], message?: string) {
      this.send({ type: 'pillar_complete', pillar_id: pillarId, pillar_name: pillarName, data: { findings }, message });
    },
  };
}

/**
 * Helper to create SSE response headers
 */
export function getSSEHeaders(): Record<string, string> {
  return {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // Disable buffering in nginx
  };
}

/**
 * Progress tracker for multi-step operations
 */
export class ProgressTracker {
  private total: number;
  private current: number = 0;
  private sendFn: (message: string) => void;

  constructor(total: number, sendFn: (message: string) => void) {
    this.total = total;
    this.sendFn = sendFn;
  }

  increment(message: string) {
    this.current++;
    this.sendFn(`[${this.current}/${this.total}] ${message}`);
  }

  update(message: string) {
    this.sendFn(message);
  }

  complete(message: string = 'All tasks completed') {
    this.sendFn(`✓ ${message}`);
  }
}
