/**
 * stream.ts — The GZMO Live Stream.
 *
 * Writes a rolling internal monologue to `GZMO/Live_Stream.md`
 * so you can leave it open in Obsidian and watch the daemon breathe.
 */

import { writeFileSync, existsSync, readFileSync } from "fs";
import { join } from "path";

const MAX_LINES = 200; // Keep the stream manageable

export class LiveStream {
  private readonly filePath: string;

  constructor(vaultPath: string) {
    this.filePath = join(vaultPath, "GZMO", "Live_Stream.md");
    this.initialize();
  }

  private initialize(): void {
    if (!existsSync(this.filePath)) {
      writeFileSync(this.filePath, `# GZMO Live Stream\n*Auto-scroll to follow daemon state*\n\n`, "utf-8");
    }
  }

  /** Append a timestamped log entry */
  log(message: string, meta?: { tension?: number; energy?: number; phase?: string }): void {
    const ts = new Date().toLocaleTimeString("de-DE", { hour12: false });
    const metaStr = meta
      ? ` **[T:${meta.tension?.toFixed(1) ?? "—"} | E:${meta.energy?.toFixed(0) ?? "—"}% | ${meta.phase ?? "—"}]**`
      : "";

    const line = `**[${ts}]**${metaStr} ${message}\n`;

    try {
      let content = readFileSync(this.filePath, "utf-8");
      const lines = content.split("\n");

      // Trim to MAX_LINES to prevent infinite growth
      if (lines.length > MAX_LINES) {
        const header = lines.slice(0, 3).join("\n");
        const tail = lines.slice(-Math.floor(MAX_LINES * 0.8)).join("\n");
        content = header + "\n\n*(earlier entries trimmed)*\n\n" + tail;
      }

      content += line;
      writeFileSync(this.filePath, content, "utf-8");
    } catch {
      // If the file was deleted or locked, just skip this tick
    }
  }

  /** Write a section break (for major events like task completion) */
  section(title: string): void {
    this.log(`\n---\n### ${title}\n`);
  }
}
