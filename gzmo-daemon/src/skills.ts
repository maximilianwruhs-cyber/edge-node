/**
 * GZMO Chaos Engine — Skills Discovery Module
 *
 * Scans the Obsidian Vault's wiki/skills/ directory for structured skill
 * files with YAML frontmatter. Skills are tagged with trigger types
 * (heartbeat, research, dream) and injected as context during the
 * appropriate engine phase.
 *
 * This module has ZERO external dependencies — uses gray-matter
 * which is already a daemon dependency.
 */

import * as fs from "fs";
import * as path from "path";
import matter from "gray-matter";

export interface SkillEntry {
  name: string;
  description: string;
  trigger: "heartbeat" | "research" | "dream" | "any";
  filePath: string;
  content: string;
}

export class SkillsDiscovery {
  private vaultDir: string;

  constructor(vaultDir: string) {
    this.vaultDir = vaultDir;
  }

  /**
   * Find all skills matching a given trigger type.
   * Returns skills tagged with the specified trigger or "any".
   */
  findSkills(trigger: "heartbeat" | "research" | "dream"): SkillEntry[] {
    const skillsDir = path.join(this.vaultDir, "wiki", "skills");

    if (!fs.existsSync(skillsDir)) return [];

    const files: string[] = fs.readdirSync(skillsDir)
      .filter((f: string) => f.endsWith(".md"));

    const skills: SkillEntry[] = [];

    for (const file of files) {
      const filePath = path.join(skillsDir, file);
      try {
        const raw = fs.readFileSync(filePath, "utf-8");
        const parsed = matter(raw);
        const skillTrigger = ((parsed.data.trigger as string) || "any").toLowerCase();

        if (skillTrigger === trigger || skillTrigger === "any") {
          skills.push({
            name: parsed.data.name || file.replace(/\.md$/, ""),
            description: parsed.data.description || "",
            trigger: skillTrigger as SkillEntry["trigger"],
            filePath: `wiki/skills/${file}`,
            content: parsed.content.trim(),
          });
        }
      } catch (err: any) {
        console.error(`[SKILLS] Parse error (${file}): ${err?.message}`);
      }
    }

    return skills;
  }

  /**
   * Format discovered skills as context injection text for the LLM.
   * Progressive disclosure: only name + description + first 500 chars.
   */
  formatForInjection(skills: SkillEntry[]): string {
    if (skills.length === 0) return "";

    const parts = [
      `[SKILLS] ${skills.length} skill procedure(s) available:`,
      "",
    ];

    for (const skill of skills) {
      parts.push(`### ${skill.name}`);
      if (skill.description) parts.push(`> ${skill.description}`);
      parts.push("");
      parts.push(skill.content.slice(0, 500));
      if (skill.content.length > 500) parts.push("...(truncated)");
      parts.push("");
    }

    return parts.join("\n");
  }
}
