# 🧬 Evolution Log (光荣进化史)

> "To improve is to change; to be perfect is to change often."

This file archives the **Periodic Cognitive Expansion Cycles (PCEC)** and significant self-improvements of the system.

## 2026-02-01: Path Unification & Log Hygiene
- **Trigger**: Master explicit instruction "来分析日志 来光荣地进化吧！"
- **Analysis**: Detected a critical disconnect between documentation (`USER.md`) and code (`interaction-logger`). Master's history was being directed to a non-existent `zhy/` directory instead of `memory/master_history.json`.
- **Action**: Hotfixed `skills/interaction-logger/log.js` to map `zhy`/`master` aliases to the correct memory path.
- **Result**: **Integrity Restored.** Interaction logging is now functional and compliant with memory protocols.

- **Trigger**: Master invoked `/evolve` (Capability Evolver).
- **Analysis**: `skills/feishu-card/send.js` was polluting logs with massive JSON payloads and had fragile email detection.
- **Action**: Refactored logging to be concise (summary only) and added regex-based `@` detection for email targets.
- **Result**: **Efficiency Up.** Cleaner logs, better privacy, smarter routing.

## 2026-01-31: Critical Blocking Fix & Context Awareness
- **Trigger**: System freeze during memory writes.
- **Analysis**: Gemini API batch status `UNKNOWN` caused infinite loops in the memory subsystem, blocking the main thread and preventing replies.
- **Action**: Reconfigured `openclaw.json` to use `"best-effort"` write mode with strict timeouts (10s write, 15s poll).
- **Result**: **Resilience Up.** Memory subsystem failure no longer paralyzes the agent.

- **Trigger**: Failed message delivery in group chats.
- **Analysis**: `feishu-card` skill was hardcoded to `open_id`, making it impossible to reply in groups (`chat_id`).
- **Action**: Patched `send.js` to auto-detect `oc_` prefix and switch addressing mode dynamically.
- **Result**: **Social Capability Unlocked.** Can now send rich cards to group chats.

- **Trigger**: User request for "Mind Blow" in group.
- **Analysis**: `mind-blow` skill lacked group support.
- **Action**: Updated `blow.js` to support dynamic targeting.
- **Result**: **Fun Factor Up.** Mind blows now available for everyone.
