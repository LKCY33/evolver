---
name: arxiv-watcher
description: Search and summarize papers from ArXiv. Use when the user asks for the latest research, specific topics on ArXiv, or a daily summary of AI papers.
---

# ArXiv Watcher

This skill interacts with the ArXiv API to find and summarize the latest research papers.

## Capabilities

- **Search**: Find papers by keyword, author, or category.
- **Summarize**: Fetch the abstract and provide a concise summary.
- **Save to Memory**: Automatically record summarized papers to `memory/RESEARCH_LOG.md` for long-term tracking.
- **Deep Dive**: Use `web_fetch` on the PDF link to extract more details if requested.

## Workflow

1. Use `node skills/arxiv-watcher/index.js "<query>" [limit]` to get the JSON results.
   - Example: `node skills/arxiv-watcher/index.js "cat:cs.AI" 3`
2. **Watch Mode (New!)**: Use `--watch` to only see papers published since the last check.
   - Example: `node skills/arxiv-watcher/index.js "LLM" --watch`
   - This persists state to `memory/arxiv_state.json`.
3. Parse the JSON output (it provides Title, Authors, Summary, and PDF Link).
4. Present the findings to the user.
5. **MANDATORY**: Append the title, authors, date, and summary of any paper discussed to `memory/RESEARCH_LOG.md`. Use the format:
   ```markdown
   ### [YYYY-MM-DD] TITLE_OF_PAPER
   - **Authors**: Author List
   - **Link**: ArXiv Link (PDF)
   - **Summary**: Brief summary of the paper and its relevance.
   ```

## Examples

- "Busca los últimos papers sobre LLM reasoning en ArXiv."
- "Dime de qué trata el paper con ID 2512.08769."
- "Hazme un resumen de las novedades de hoy en ArXiv sobre agentes."

## Resources

- `skills/arxiv-watcher/index.js`: Main Node.js script (clean JSON output).
- `scripts/search_arxiv.sh`: Legacy bash script (raw XML).
