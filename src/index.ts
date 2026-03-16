import { OpenAPIHono } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';
import { cors } from 'hono/cors';
import companies from './routes/companies';
import preferences from './routes/preferences';
import jobs from './routes/jobs';

export type Bindings = {
  DB: D1Database;
};

import { basicAuth } from 'hono/basic-auth';

const app = new OpenAPIHono<{ Bindings: Bindings }>();

app.use('*', cors());

app.use('/api/db/*', basicAuth({ username: 'admin', password: 'password' })); // Add a proper auth mechanism in production

app.route('/api/db/companies', companies);
app.route('/api/db/preferences', preferences);
app.route('/api/db/jobs', jobs);

app.get('/doc', swaggerUI({ url: '/doc/json' }));

app.doc('/doc/json', {
  openapi: '3.0.0',
  info: {
    version: '1.0.0',
    title: 'Job Scraper API',
  },
});

export default app;
