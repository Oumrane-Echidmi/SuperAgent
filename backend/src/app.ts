import express from 'express';
import pg from 'pg';
import type { ErrorRequestHandler } from 'express';
import { validateGraph } from './compiler.ts';
import { Database, HttpError } from './database.ts';
import { identityRoutes } from './identity-routes.ts';
import { workflowRoutes } from './workflow-routes.ts';
import { scenarioRoutes } from './scenario-routes.ts';
import { builderRoutes } from './builder-routes.ts';
import { matchingRoutes } from './matching-routes.ts';
import { builderChatRoutes } from './builder-chat-routes.ts';

export function createApp(db?: Database, options: { builderAiEnabled?: boolean } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'", 'Referrer-Policy': 'no-referrer' });
    next();
  });
  app.use(express.json({ limit: '64kb', inflate: false }));
  app.get('/healthz', (_req, res) => { res.json({ status: 'ok' }); });
  app.use('/v1', workflowRoutes());
  if (db) app.use('/v1', identityRoutes(db));
  if (db) app.use('/v1', scenarioRoutes(db));
  if (db) app.use('/v1', builderRoutes(db));
  if (db) app.use('/v1', matchingRoutes(db));
  if (db) app.use('/v1', builderChatRoutes(db, options.builderAiEnabled ?? false));
  app.post('/v1/graph-validations', (req, res) => {
    const report = validateGraph(req.body);
    if (!report.valid) {
      res.status(422).json({ error: { code: 'GRAPH_INVALID', message: 'Fix the graph before continuing.', details: report } });
      return;
    }
    res.json(report);
  });
  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found.' } });
  });
  const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    if (error instanceof pg.DatabaseError && (error.code === '22P05' || error.code === '22021'
      || (error.code === '23514' && error.constraint === 'scenarios_draft_check'))) {
      res.status(422).json({ error: { code: 'INVALID_INPUT', message: 'Check text encoding and the stored scenario size.' } });
      return;
    }
    if (error instanceof HttpError) {
      if (error.status === 429) res.set('Retry-After', '900');
      res.status(error.status).json({ error: { code: error.code, message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }) } });
      return;
    }
    const type = typeof error === 'object' && error !== null && 'type' in error ? error.type : undefined;
    const [status, code, message] = type === 'entity.too.large'
      ? [413, 'BODY_TOO_LARGE', 'JSON body exceeds 64kb.'] as const
      : type === 'entity.parse.failed'
        ? [400, 'INVALID_JSON', 'Provide valid JSON.'] as const
        : type === 'encoding.unsupported' || type === 'charset.unsupported'
          ? [415, 'UNSUPPORTED_ENCODING', 'Provide uncompressed UTF-8 JSON.'] as const
          : [500, 'INTERNAL_ERROR', 'An unexpected error occurred.'] as const;
    res.status(status).json({ error: { code, message } });
  };
  app.use(errorHandler);
  return app;
}
