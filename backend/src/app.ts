import express from 'express';
import type { ErrorRequestHandler } from 'express';
import { validateGraph } from './compiler.ts';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb', inflate: false }));
  app.get('/healthz', (_req, res) => { res.json({ status: 'ok' }); });
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
