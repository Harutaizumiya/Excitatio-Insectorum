import http from 'node:http';
import { app } from './app';
import { config } from './config';
import { realtimeService } from './modules/realtime/realtime.service';
import { startScoreSettlementJob } from './modules/scores/score-settlement.job';
import { startWeeklySeatingRotationJob } from './modules/seating/weekly-seating-rotation.job';
import { announcementsService } from './modules/announcements/announcements.service';

const isBun = typeof (globalThis as unknown as { Bun?: unknown }).Bun !== 'undefined';

if (process.env.NODE_ENV !== 'test') {
  // Socket.IO and the Elysia Node adapter both register an HTTP upgrade handler.
  // Let one plain HTTP server own the upgrade lifecycle so Socket.IO is the only
  // handler for /socket.io WebSocket upgrades, while Elysia handles normal HTTP.
  const server = http.createServer(async (req, res) => {
    const url = `http://${req.headers.host || 'localhost'}${req.url || '/'}`;
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (Array.isArray(value)) value.forEach((item) => headers.append(key, item));
      else if (value) headers.set(key, value);
    }

    const method = req.method || 'GET';
    const hasBody = method !== 'GET' && method !== 'HEAD';
    const request = new Request(url, {
      method,
      headers,
      body: hasBody ? req : undefined,
      duplex: hasBody ? 'half' : undefined,
    } as RequestInit);
    const response = await app.handle(request);

    res.statusCode = response.status;
    for (const [key, value] of response.headers.entries()) res.setHeader(key, value);
    if (!response.body) {
      res.end();
      return;
    }
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
  });

  realtimeService.attach(server);
  startScoreSettlementJob(config.scoreSettlementCron);
  startWeeklySeatingRotationJob(config.seatRotationCron);
  announcementsService.start();
  server.listen(config.port, () => {
    console.log(
      `Elysia server listening on http://localhost:${config.port} (${isBun ? 'Bun' : 'Node.js'})`,
    );
  });
}
