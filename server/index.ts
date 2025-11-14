import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log as viteLog } from "./vite";
import { storage } from "./storage";
import { startUnifiedMock, stopUnifiedMock } from "./unified-mock";
import { log } from "./logger";

const app = express();

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}
app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      // Nur bei Debug-Level HTTP-Logs ausgeben
      const logSettings = storage.getLogSettings();
      if (logSettings.level === "debug") {
        let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
        if (capturedJsonResponse) {
          logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
        }

        if (logLine.length > 80) {
          logLine = logLine.slice(0, 79) + "…";
        }

        viteLog(logLine);
      }
    }
  });

  next();
});

(async () => {
  // Auto-Start Mock-Server wenn DEMO_AUTOSTART=true oder demoMode aktiviert ist
  const shouldStartMock = process.env.DEMO_AUTOSTART === 'true' || storage.getSettings()?.demoMode;
  
  if (shouldStartMock) {
    try {
      await startUnifiedMock();
      log('info', 'system', '✅ Unified Mock Server automatisch gestartet (Demo-Modus)');
    } catch (error) {
      log('error', 'system', '⚠️ Fehler beim Starten des Mock-Servers', error instanceof Error ? error.message : String(error));
      log('warning', 'system', 'Fortsetzung ohne Mock-Server...');
    }
  }
  
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    viteLog(`serving on port ${port}`);
  });
  
  // Graceful Shutdown für Mock-Server (falls aktiv)
  const shutdown = async () => {
    log('info', 'system', '🛑 Graceful Shutdown wird durchgeführt...');
    try {
      await stopUnifiedMock();
    } catch (error) {
      log('error', 'system', 'Fehler beim Stoppen des Mock-Servers', error instanceof Error ? error.message : String(error));
    }
    process.exit(0);
  };
  
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
})();
