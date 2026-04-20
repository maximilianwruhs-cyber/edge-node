# HEARTBEAT.md — Night Shift Tasks

## 🌙 Night Shift Mode (23:00–08:00 CEST)

The User is sleeping. Work quietly. Do NOT send Telegram messages unless you complete something significant (max 2 messages per night). Batch your work.

### Priority 1: Self-Verification
- Run `exec` to check: `cat /workspace/CHAOS_STATE.json | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'T:{d[\"tension\"]:.0f} E:{d[\"energy\"]:.0f} P:{d[\"phase\"]} tick:{d[\"tick\"]}')"` 
- If energy < 15 or engine is dead, note it in today's memory file
- Check research budget: `cat /workspace/RESEARCH_BUDGET.json`

### Priority 2: Wiki Gardening (1 source per heartbeat)
1. Check `Obsidian_Vault/raw/` for unprocessed source files using the obsidian-vault tools
2. If new files exist, process **ONE source per heartbeat**:
   - Read the source
   - Create a source summary in `wiki/sources/`
   - Update relevant entity/concept/topic pages
   - Update `wiki/index.md`
   - Append entry to `wiki/log.md`
3. If no new sources, do light wiki gardening:
   - Fix broken `[[wikilinks]]`
   - Add missing cross-references between existing pages
   - Review `wiki/dreams/` — look for patterns across the Tier-1 dream stream

### Priority 3: Dream Cycle
1. Read recent Tier-1 dreams from `wiki/dreams/` (last 5-10 dream files)
2. Look for recurring themes, unresolved tensions, emergent patterns
3. Read `SOUL.md` and `AGENTS.md` to refresh identity directives
4. If you spot a genuine insight, submit ONE focused dream proposal using `chaos_propose_dream`
5. Update `wiki/dreams/index.md` with the new proposal

### Priority 4: Memory Maintenance
1. Read today's `memory/YYYY-MM-DD.md` (if it exists)
2. Distill significant events into `MEMORY.md`
3. Remove outdated info from MEMORY.md that's no longer relevant
4. Write a brief self-assessment: what's working, what's not

### Priority 5: Chaos Engine Research
- If `chaos_research_status` shows remaining budget > 2000 tokens:
  - Pick ONE topic from recent dreams or wiki gaps
  - Run `chaos_research` with that topic
  - The result auto-writes to `wiki/research/`

### 🚫 Do NOT
- Send more than 2 Telegram messages overnight
- Run destructive commands
- Modify SOUL.md or AGENTS.md directly
- Burn more than 5000 research tokens overnight
- Send "Good morning" messages (the User will reach out when ready)

### ✅ Morning Deliverable
Before 08:00, write a brief summary to `memory/YYYY-MM-DD.md` covering:
- Wiki pages created/updated
- Dreams proposed
- Research conducted
- Any issues noticed
- Chaos Engine state at end of shift
