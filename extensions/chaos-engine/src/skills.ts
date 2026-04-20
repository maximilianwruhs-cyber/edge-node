/**
 * GZMO Chaos Engine — Skills Discovery Module
 *
 * Scans the Obsidian Vault's wiki/skills/ directory for structured skill
 * files with YAML frontmatter. Skills can be tagged with trigger types
 * (heartbeat, research, dream) and are injected as context during the
 * appropriate engine phase.
 *
 * Ported concept from Hermes Agent's 26-skill directory discovery pattern,
 * adapted for the Vault + Chaos Engine heartbeat trigger model.
 *
 * Skills live in wiki/skills/ so they are QMD-searchable alongside
 * regular vault content.
 */

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
    const fs = require("fs");
    const path = require("path");
    const skillsDir = path.join(this.vaultDir, "wiki", "skills");

    if (!fs.existsSync(skillsDir)) return [];

    const files: string[] = fs.readdirSync(skillsDir)
      .filter((f: string) => f.endsWith(".md"));

    const skills: SkillEntry[] = [];

    for (const file of files) {
      const filePath = path.join(skillsDir, file);
      try {
        const raw: string = fs.readFileSync(filePath, "utf-8");
        const parsed = this.parseFrontmatter(raw);
        if (!parsed) continue;

        const { frontmatter, body } = parsed;
        const skillTrigger = (frontmatter.trigger || "any").toLowerCase();

        if (skillTrigger === trigger || skillTrigger === "any") {
          skills.push({
            name: frontmatter.name || file.replace(/\.md$/, ""),
            description: frontmatter.description || "",
            trigger: skillTrigger as SkillEntry["trigger"],
            filePath: `wiki/skills/${file}`,
            content: body.trim(),
          });
        }
      } catch (err: any) {
        console.error(`[CHAOS] Skill parse error (${file}): ${err?.message}`);
      }
    }

    return skills;
  }

  /**
   * Format discovered skills as context injection text for the LLM.
   * Used in the before_prompt_build hook when heartbeat skills are active.
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
      // Include first 500 chars of skill content for context
      parts.push(skill.content.slice(0, 500));
      if (skill.content.length > 500) parts.push("...(truncated)");
      parts.push("");
    }

    return parts.join("\n");
  }

  /**
   * Parse YAML frontmatter from a markdown file.
   * Expects --- delimited frontmatter at the start of the file.
   */
  private parseFrontmatter(raw: string): {
    frontmatter: Record<string, string>;
    body: string;
  } | null {
    const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) return null;

    const fmBlock = match[1];
    const body = match[2];

    // Simple YAML key: value parsing (no nested structures)
    const frontmatter: Record<string, string> = {};
    for (const line of fmBlock.split("\n")) {
      const kv = line.match(/^(\w+)\s*:\s*(.+)$/);
      if (kv) {
        frontmatter[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, "");
      }
    }

    return { frontmatter, body };
  }
}
