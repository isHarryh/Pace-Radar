import { collect } from './collector';

export interface Env {
  DB: D1Database;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/collect' || url.pathname === '/cdn-cgi/handler/scheduled') {
      await collect(env.DB);
      return new Response('collected', { headers: { 'Content-Type': 'text/plain' } });
    }
    return new Response('ok', { headers: { 'Content-Type': 'text/plain' } });
  },
  async scheduled(_controller: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    await collect(env.DB);
  },
};