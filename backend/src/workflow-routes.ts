import { Router } from 'express';
import { z } from 'zod';
import { listCapabilities } from './capabilities.ts';
import { HttpError } from './database.ts';
import { validateWorkflow } from './workflow-compiler.ts';

const pagination = z.strictObject({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export function workflowRoutes() {
  const router = Router();
  router.get('/capabilities', (req, res) => {
    const parsed = pagination.safeParse(req.query);
    if (!parsed.success) throw new HttpError(422, 'INVALID_INPUT', 'Provide a positive page and pageSize between 1 and 100.');
    const { page, pageSize } = parsed.data;
    const capabilities = listCapabilities();
    res.json({ data: capabilities.slice((page - 1) * pageSize, page * pageSize),
      pagination: { page, pageSize, totalItems: capabilities.length, totalPages: Math.ceil(capabilities.length / pageSize) } });
  });
  router.post('/workflow-validations', (req, res) => {
    const report = validateWorkflow(req.body);
    if (!report.valid) {
      res.status(422).json({ error: { code: 'WORKFLOW_INVALID', message: 'Fix the workflow before continuing.', details: report } });
      return;
    }
    res.json(report);
  });
  return router;
}
