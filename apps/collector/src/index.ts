import { collect } from './collector';

export interface Env {
  DB: D1Database;
}

export default {
  async fetch(_req: Request, _env: Env): Promise<Response> {
    return new Response('ok', { headers: { 'Content-Type': 'text/plain' } });
  },
  async scheduled(_controller: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    await collect(env.DB);
  },
};