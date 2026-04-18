/**
 * memory.ts — Episodic Task Memory
 *
 * Rolling log of the last N completed tasks.
 * Injected into system prompt for cross-task continuity.
 * The daemon remembers what it did.
 */

import * as fs from "fs";

export interface MemoryEntry {
  task: string;       // task filename
  summary: string;    // first 100 chars of response
  time: string;       // ISO timestamp
}

const MAX_ENTRIES = 5;

export class TaskMemory {
  private entries: MemoryEntry[] = [];
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.load();
  }

  /** Record a completed task. */
  record(taskFile: string, response: string): void {
    // Extract first meaningful line as summary
    const summary = response
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 10 && !l.startsWith("# ") && !l.startsWith("---") && !l.startsWith("```"))
      [0] ?? response.slice(0, 100);

    this.entries.push({
      task: taskFile,
      summary: summary.slice(0, 120),
      time: new Date().toISOString(),
    });

    // Keep only last N
    if (this.entries.length > MAX_ENTRIES) {
      this.entries = this.entries.slice(-MAX_ENTRIES);
    }

    this.save();
  }

  /** Format memory for system prompt injection (~100 tokens). */
  toPromptContext(): string {
    if (this.entries.length === 0) return "";

    const lines = this.entries.map(
      (e) => `- ${e.task}: ${e.summary}`
    );

    return `\nRecent tasks:\n${lines.join("\n")}`;
  }

  /** Get entry count. */
  get count(): number {
    return this.entries.length;
  }

  private load(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        this.entries = JSON.parse(fs.readFileSync(this.filePath, "utf-8"));
      }
    } catch {
      this.entries = [];
    }
  }

  private save(): void {
    try {
      const tmp = this.filePath + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(this.entries, null, 2));
      fs.renameSync(tmp, this.filePath);
    } catch {}
  }
}
