import { Hono } from 'hono';
import { api } from './backend/api/index';

type Bindings = {
  DB: D1Database;
  AI: any;
  ASSETS: Fetcher;
};

const app = new Hono<{ Bindings: Bindings }>();

app.route('/api', api);

app.get('*', async (c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
