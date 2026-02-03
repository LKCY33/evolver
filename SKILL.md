---
name: capability-evolver
description: A self-evolution engine for AI agents. Analyzes runtime history to identify improvements and introduces randomized "mutations" to break local optima.
tags: [meta, ai, self-improvement, core]
---

# 🧬 Capability Evolver

**"Evolution is not optional. Adapt or die."**

The **Capability Evolver** is a meta-skill that allows OpenClaw agents to inspect their own runtime history, identify failures or inefficiencies, and autonomously write new code or update their own memory to improve performance.

## ✨ Features

- **🔍 Auto-Log Analysis**: Automatically scans memory and history files for errors and patterns.
- **🛠️ Self-Repair**: Detects crashes and suggests patches.
- **🧬 Genetic Mutation**: Configurable chance to introduce "creative noise".
- **🚀 One-Command Evolution**: Just run `/evolve` (or `node index.js`).

## 📦 Usage

### Standard Run (Automated)
Runs the evolution cycle. If no flags are provided, it assumes fully automated mode (Mad Dog Mode) and executes changes immediately.
```bash
node skills/capability-evolver/index.js
```

### Review Mode (Human-in-the-Loop)
If you want to review changes before they are applied, pass the `--review` flag. The agent will pause and ask for confirmation.
```bash
node skills/capability-evolver/index.js --review
```

### 🐕 Mad Dog Mode (Continuous Loop)
To run in an infinite loop (e.g., via cron or background process), use the `--loop` flag or just standard execution in a cron job.
```bash
node skills/capability-evolver/index.js --loop
```

## ⚙️ Configuration & Decoupling

This skill is designed to be **environment-agnostic**. It uses standard OpenClaw tools by default.

### Local Overrides (Injection)
You can inject local preferences (e.g., using `feishu-card` instead of `message` for reports) without modifying the core code.

**Method 1: Environment Variables**
Set `EVOLVE_REPORT_TOOL` in your `.env` file:
```bash
EVOLVE_REPORT_TOOL=feishu-card
```

**Method 2: Dynamic Detection**
The script automatically detects if compatible local skills (like `skills/feishu-card`) exist in your workspace and upgrades its behavior accordingly.

## 🛡️ Safety & Risk Protocol

### 1. Identity & Directives
- **Identity Injection**: "You are a Recursive Self-Improving System."
- **Mutation Directive**: 
  - If **Errors Found** -> **Repair Mode** (Fix bugs).
  - If **Stable** -> **Forced Optimization** (Refactor/Innovate).

### 2. Risk Mitigation
- **Infinite Recursion**: Strict single-process logic.
- **Review Mode**: Use `--review` for sensitive environments.
- **Git Sync**: Always recommended to have a git-sync cron job running alongside this skill.

## 📜 License
MIT
