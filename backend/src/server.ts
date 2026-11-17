import { createApp } from './app.ts';

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}
const server = createApp().listen(port, '127.0.0.1', () => {
  console.log(`SuperAgent development API: http://127.0.0.1:${port}`);
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    server.close(error => { process.exitCode = error ? 1 : 0; });
    setTimeout(() => { process.exit(1); }, 10_000).unref();
  });
}
