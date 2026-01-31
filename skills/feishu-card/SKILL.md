---
name: feishu-card
description: Send rich interactive cards to Feishu (Lark) users or groups. Supports Markdown, titles, color headers, and buttons.
tags: [feishu, lark, card, message, interactive]
---

# Feishu Card Skill

Send rich interactive cards via Feishu Open API.

## Usage

```bash
node send.js --target "ou_..." --text "Hello **World**" --title "Notification" --color blue
```

## Options
- `-t, --target`: User Open ID (`ou_...`) or Group Chat ID (`oc_...`).
- `-x, --text`: Markdown content.
- `-f, --text-file`: Read markdown from file.
- `--title`: Card header title.
- `--color`: Header color (blue, red, green, etc.).
- `--button-text`: Add a bottom button.
- `--button-url`: Button URL.
