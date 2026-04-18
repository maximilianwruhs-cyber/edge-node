/**
 * stream.ts — The GZMO Live Stream.
 *
 * Writes a rolling internal monologue to `GZMO/Live_Stream.md`
 * so you can leave it open in Obsidian and watch the daemon breathe.
 *
 * Buffers writes to reduce I/O from 5+/sec to ~1/5sec.
 */

import { writeFileSync, existsSync, readFileSync } from "fs";
import { join } from "path";

const MAX_LINES = 200;      // Keep the stream manageable
const FLUSH_INTERVAL = 5000; // Flush every 5 seconds
const FLUSH_THRESHOLD = 10;  // Or after 10 queued entries

export class LiveStream {
  private readonly filePath: string;
  private buffer: string[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(vaultPath: string) {
    this.filePath = join(vaultPath, "GZMO", "Live_Stream.md");
    this.initialize();

    // Periodic flush
    this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL);
  }

  private initialize(): void {
    if (!existsSync(this.filePath)) {
      writeFileSync(this.filePath, `# GZMO Live Stream\n*Auto-scroll to follow daemon state*\n\n`, "utf-8");
    }
  }

  /** Append a timestamped log entry (buffered) */
  log(message: string, meta?: { tension?: number; energy?: number; phase?: string }): void {
    const ts = new Date().toLocaleTimeString("de-DE", { hour12: false });
    const metaStr = meta
      ? ` **[T:${meta.tension?.toFixed(1) ?? "—"} | E:${meta.energy?.toFixed(0) ?? "—"}% | ${meta.phase ?? "—"}]**`
      : "";

    this.buffer.push(`**[${ts}]**${metaStr} ${message}\n`);

    // Flush immediately if threshold reached
    if (this.buffer.length >= FLUSH_THRESHOLD) {
      this.flush();
    }
  }

  /** Write buffered entries to disk */
  private flush(): void {
    if (this.buffer.length === 0) return;

    try {
      let content = readFileSync(this.filePath, "utf-8");
      const lines = content.split("\n");

      // Trim to MAX_LINES to prevent infinite growth
      if (lines.length > MAX_LINES) {
        const header = lines.slice(0, 3).join("\n");
        const tail = lines.slice(-Math.floor(MAX_LINES * 0.8)).join("\n");
        content = header + "\n\n*(earlier entries trimmed)*\n\n" + tail;
      }

      // Append all buffered lines at once
      content += this.buffer.join("");
      this.buffer = [];
      writeFileSync(this.filePath, content, "utf-8");
    } catch {
      // If the file was deleted or locked, discard buffer
      this.buffer = [];
    }
  }

  /** Write a section break (for major events like task completion) */
  section(title: string): void {
    this.log(`\n---\n### ${title}\n`);
  }

  /** Flush on shutdown */
  destroy(): void {
    this.flush();
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }
}
