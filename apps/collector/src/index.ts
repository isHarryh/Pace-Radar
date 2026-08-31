import { collect } from './collector';

export interface Env {
  DB: D1Database;
}

export default {
  async scheduled(_controller: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    await collect(env.DB);
  },
};