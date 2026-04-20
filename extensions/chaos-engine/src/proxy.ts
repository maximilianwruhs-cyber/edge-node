/**
 * GZMO Chaos Engine — Ollama Temperature Proxy
 *
 * Lightweight HTTP proxy that sits between OpenClaw and Ollama.
 * Intercepts inference requests and injects:
 *   - temperature  ← from Lorenz attractor x-coordinate
 *   - max_tokens   ← from Lorenz attractor z-coordinate
 *
 * This is the solution to the OpenClaw Plugin API limitation:
 * the llm_input hook exposes model/prompt/messages but NOT
 * inference parameters like temperature and max_tokens.
 *
 * Listens on :11435, forwards to :11434 (Ollama).
 */

import * as http from "http";
import type { PulseLoop } from "./pulse";

const OLLAMA_HOST = "127.0.0.1";
const OLLAMA_PORT = 11434;

export class ChaosProxy {
  private server: http.Server | null = null;
  private pulse: PulseLoop;
  private proxyPort: number;

  constructor(pulse: PulseLoop, proxyPort: number = 11435) {
    this.pulse = pulse;
    this.proxyPort = proxyPort;
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.server.listen(this.proxyPort, "127.0.0.1", () => {
        console.log(`[CHAOS] Ollama proxy listening on :${this.proxyPort} → :${OLLAMA_PORT}`);
        resolve();
      });

      this.server.on("error", (err) => {
        console.error("[CHAOS] Proxy server error:", err.message);
        reject(err);
      });
    });
  }

  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
      console.log("[CHAOS] Ollama proxy stopped");
    }
  }

  private handleRequest(clientReq: http.IncomingMessage, clientRes: http.ServerResponse): void {
    const chunks: Buffer[] = [];

    clientReq.on("data", (chunk: Buffer) => chunks.push(chunk));

    clientReq.on("end", () => {
      let body = Buffer.concat(chunks);
      const path = clientReq.url ?? "/";
      const method = clientReq.method ?? "GET";

      // Only inject temperature into chat/generate endpoints
      const isChatEndpoint = path.includes("/api/chat") || path.includes("/api/generate");
      const isOpenAIEndpoint = path.includes("/v1/chat/completions");

      if ((isChatEndpoint || isOpenAIEndpoint) && method === "POST" && body.length > 0) {
        try {
          const parsed = JSON.parse(body.toString());
          const snap = this.pulse.snapshot();

          if (isChatEndpoint) {
            // Ollama native API
            parsed.options = parsed.options ?? {};
            parsed.options.temperature = snap.llmTemperature;
            parsed.options.num_predict = snap.llmMaxTokens;
          } else {
            // OpenAI-compatible API (/v1/chat/completions)
            parsed.temperature = snap.llmTemperature;
            parsed.max_tokens = snap.llmMaxTokens;
          }

          body = Buffer.from(JSON.stringify(parsed));
        } catch (err: any) {
          // JSON parsing failed — forward unmodified
          console.error(`[CHAOS] Proxy JSON parse failed: ${err?.message}`);
        }
      }

      // Forward to Ollama
      const proxyReq = http.request(
        {
          hostname: OLLAMA_HOST,
          port: OLLAMA_PORT,
          path,
          method,
          headers: {
            ...clientReq.headers,
            "content-length": body.length.toString(),
            host: `${OLLAMA_HOST}:${OLLAMA_PORT}`,
          },
        },
        (proxyRes) => {
          clientRes.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers);
          proxyRes.pipe(clientRes, { end: true });
        },
      );

      proxyReq.on("error", (err) => {
        console.error("[CHAOS] Proxy forward error:", err.message);
        clientRes.writeHead(502);
        clientRes.end(JSON.stringify({ error: "chaos proxy: upstream unavailable" }));
      });

      proxyReq.write(body);
      proxyReq.end();
    });
  }
}
