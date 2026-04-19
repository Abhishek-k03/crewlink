import { HttpResponse } from 'msw';

// Held in a mutable object rather than constants so tests can make requests
// instant and failures deterministic.
export const networkSimulation = {
  latencyMinMs: 200,
  latencyMaxMs: 1200,
  writeFailureRate: 0.07,
};

export class SimulatedFailure extends Error {
  readonly response: Response;

  constructor(response: Response) {
    super('Simulated network failure');
    this.response = response;
  }
}

// Called before touching the database, never after — a failure injected after a
// write already persisted would leave the server and the rolled-back client disagreeing.
export async function simulateNetwork(isWrite = false): Promise<void> {
  const { latencyMinMs, latencyMaxMs, writeFailureRate } = networkSimulation;

  const delay = latencyMinMs + Math.random() * (latencyMaxMs - latencyMinMs);
  if (delay > 0) {
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  if (isWrite && Math.random() < writeFailureRate) {
    throw new SimulatedFailure(
      HttpResponse.json(
        { message: 'The server could not complete the request. Please try again.' },
        { status: 500 },
      ),
    );
  }
}
