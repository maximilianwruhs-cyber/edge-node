#!/usr/bin/env node
/**
 * GZMO Vault Janitor — Autonomous Vault Maintenance
 *
 * Invoked periodically by the Chaos Engine's autonomous_pulse.
 * Handles two classes of waste:
 *
 *   1. Zombie Dreams:  Empty/tiny (<100 bytes) or "untitled-dream" files
 *                      in wiki/dreams/ that clutter the search index.
 *
 *   2. Raw Accumulation: NotebookLM exports and agent-log artifacts
 *                        sitting in raw/ undigested. Files older than
 *                        ARCHIVE_AFTER_DAYS are moved to raw/archive/.
 *
 * Usage:
 *   node vault_janitor.js [--dry-run] [--vault /path/to/vault]
 *
 * Exit codes:
 *   0 = success (or dry-run complete)
 *   1 = error
 */

const fs = require("fs");
const path = require("path");

// ── Configuration ──────────────────────────────────────────────
const DREAM_MIN_BYTES = 100;
const ARCHIVE_AFTER_DAYS = 7;
const ARCHIVE_DIR_NAME = "archive";
const RAW_SUBDIRS = ["notebooklm", "agent-logs"];

// ── CLI Args ───────────────────────────────────────────────────
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const vaultIdx = args.indexOf("--vault");
const vaultDir = vaultIdx !== -1 && args[vaultIdx + 1]
  ? args[vaultIdx + 1]
  : process.env.VAULT_DIR || "/workspace/Obsidian_Vault";

// ── Logging ────────────────────────────────────────────────────
const PREFIX = dryRun ? "[JANITOR DRY-RUN]" : "[JANITOR]";
const log = (msg) => console.log(`${PREFIX} ${msg}`);
const warn = (msg) => console.warn(`${PREFIX} ⚠ ${msg}`);

// ── Stats (returned as JSON for Chaos Engine consumption) ──────
const stats = {
  zombieDreamsRemoved: 0,
  rawFilesArchived: 0,
  bytesReclaimed: 0,
  errors: [],
  timestamp: new Date().toISOString(),
};

// ══════════════════════════════════════════════════════════════════
//  1. ZOMBIE DREAM CLEANUP
// ══════════════════════════════════════════════════════════════════

function cleanZombieDreams() {
  const dreamsDir = path.join(vaultDir, "wiki", "dreams");
  if (!fs.existsSync(dreamsDir)) {
    log("No dreams directory found — skipping zombie scan.");
    return;
  }

  const files = fs.readdirSync(dreamsDir).filter(f => f.endsWith(".md"));
  log(`Scanning ${files.length} dream files for zombies...`);

  for (const file of files) {
    const filepath = path.join(dreamsDir, file);
    try {
      const stat = fs.statSync(filepath);

      // Criterion 1: File too small to contain real content
      const tooSmall = stat.size < DREAM_MIN_BYTES;

      // Criterion 2: Untitled dream placeholder
      const isUntitled = file.toLowerCase().includes("untitled-dream") ||
                         file.toLowerCase().includes("untitled_dream");

      if (tooSmall || isUntitled) {
        const reason = tooSmall
          ? `too small (${stat.size} bytes < ${DREAM_MIN_BYTES})`
          : "untitled placeholder";

        if (dryRun) {
          log(`  WOULD DELETE: ${file} — ${reason}`);
        } else {
          fs.unlinkSync(filepath);
          log(`  DELETED: ${file} — ${reason}`);
        }
        stats.zombieDreamsRemoved++;
        stats.bytesReclaimed += stat.size;
      }
    } catch (err) {
      const msg = `Error processing dream ${file}: ${err.message}`;
      warn(msg);
      stats.errors.push(msg);
    }
  }
}

// ══════════════════════════════════════════════════════════════════
//  2. RAW FILE ARCHIVAL
// ══════════════════════════════════════════════════════════════════

function archiveStaleRawFiles() {
  const rawDir = path.join(vaultDir, "raw");
  if (!fs.existsSync(rawDir)) {
    log("No raw directory found — skipping archival.");
    return;
  }

  const cutoffMs = Date.now() - (ARCHIVE_AFTER_DAYS * 24 * 60 * 60 * 1000);

  for (const subdir of RAW_SUBDIRS) {
    const sourceDir = path.join(rawDir, subdir);
    if (!fs.existsSync(sourceDir)) continue;

    const archiveDir = path.join(rawDir, ARCHIVE_DIR_NAME, subdir);
    const files = fs.readdirSync(sourceDir).filter(f => !f.startsWith("."));

    let staleCount = 0;
    for (const file of files) {
      const filepath = path.join(sourceDir, file);
      try {
        const stat = fs.statSync(filepath);
        if (!stat.isFile()) continue;
        if (stat.mtimeMs > cutoffMs) continue; // Not stale yet

        staleCount++;
        const destPath = path.join(archiveDir, file);

        if (dryRun) {
          log(`  WOULD ARCHIVE: ${subdir}/${file} (${(stat.size / 1024).toFixed(1)}K, ${Math.floor((Date.now() - stat.mtimeMs) / 86400000)}d old)`);
        } else {
          fs.mkdirSync(archiveDir, { recursive: true });
          fs.renameSync(filepath, destPath);
          log(`  ARCHIVED: ${subdir}/${file} → archive/${subdir}/`);
        }
        stats.rawFilesArchived++;
        stats.bytesReclaimed += stat.size;
      } catch (err) {
        const msg = `Error archiving ${subdir}/${file}: ${err.message}`;
        warn(msg);
        stats.errors.push(msg);
      }
    }

    if (staleCount === 0) {
      log(`  ${subdir}/: all files are fresh (< ${ARCHIVE_AFTER_DAYS} days).`);
    }
  }
}

// ══════════════════════════════════════════════════════════════════
//  MAIN
// ══════════════════════════════════════════════════════════════════

function main() {
  log(`=== Vault Janitor starting ===`);
  log(`Vault: ${vaultDir}`);
  log(`Mode: ${dryRun ? "DRY RUN (no changes)" : "LIVE"}`);
  log("");

  if (!fs.existsSync(vaultDir)) {
    warn(`Vault directory does not exist: ${vaultDir}`);
    process.exit(1);
  }

  // 1. Clean zombie dreams
  cleanZombieDreams();
  log("");

  // 2. Archive stale raw files
  archiveStaleRawFiles();
  log("");

  // Summary
  log(`=== Janitor Summary ===`);
  log(`  Zombie dreams removed: ${stats.zombieDreamsRemoved}`);
  log(`  Raw files archived:    ${stats.rawFilesArchived}`);
  log(`  Bytes reclaimed:       ${(stats.bytesReclaimed / 1024).toFixed(1)} KB`);
  log(`  Errors:                ${stats.errors.length}`);

  // Output stats as JSON to stdout (last line) for programmatic consumption
  console.log(`\n__JANITOR_STATS__${JSON.stringify(stats)}`);
}

// ── Export for programmatic use by Chaos Engine ────────────────
module.exports = { cleanZombieDreams, archiveStaleRawFiles, stats };

// ── CLI entry ─────────────────────────────────────────────────
if (require.main === module) {
  main();
}
