// skills/arxiv-watcher/index.js
const fs = require('fs');
const path = require('path');

const ARGS = process.argv.slice(2);

// Parse --format flag
let OUTPUT_FORMAT = 'json';
const formatFlagIndex = ARGS.indexOf('--format');
if (formatFlagIndex !== -1 && ARGS[formatFlagIndex + 1]) {
    OUTPUT_FORMAT = ARGS[formatFlagIndex + 1];
    // Remove from ARGS so it doesn't mess up query detection
    ARGS.splice(formatFlagIndex, 2);
}

// Parse --limit flag
const limitFlagIndex = ARGS.indexOf('--limit');
let MAX_RESULTS = 10;
if (limitFlagIndex !== -1 && ARGS[limitFlagIndex + 1]) {
    const parsedLimit = parseInt(ARGS[limitFlagIndex + 1], 10);
    if (!isNaN(parsedLimit) && parsedLimit > 0) {
        MAX_RESULTS = parsedLimit;
        ARGS.splice(limitFlagIndex, 2);
    }
}

// Parse flags
const WATCH_MODE = ARGS.includes('--watch');
if (WATCH_MODE) {
    const watchIndex = ARGS.indexOf('--watch');
    ARGS.splice(watchIndex, 1);
}

const QUERY_ARG_INDEX = ARGS.findIndex(a => !a.startsWith('-'));
let QUERY = (QUERY_ARG_INDEX !== -1 ? ARGS[QUERY_ARG_INDEX] : 'all:artificial intelligence');


// State file for --watch mode
const STATE_FILE = path.resolve(__dirname, '../../memory/arxiv_state.json');

// Intelligent query handling
if (!QUERY.includes(':')) {
    QUERY = `all:${QUERY}`;
}

function loadState() {
    if (fs.existsSync(STATE_FILE)) {
        try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch (e) {}
    }
    return {};
}

function saveState(state) {
    try { fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2)); } catch (e) {}
}

async function fetchWithRetry(url, options = {}, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), options.timeout || 30000);
            
            const res = await fetch(url, {
                ...options,
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
            return await res.text();
        } catch (e) {
            if (i === retries - 1) throw e;
            // Exponential backoff: 1s, 2s, 4s
            await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
        }
    }
}

// Helper to fetch data
async function fetchArxiv(query, max) {
    const url = `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(query)}&start=0&max_results=${max}&sortBy=submittedDate&sortOrder=descending`;
    
    return fetchWithRetry(url, {
        headers: {
            'User-Agent': 'OpenClaw/1.1 (EvolutionBot; +https://github.com/example/openclaw)' 
        },
        timeout: 30000 // 30s timeout
    });
}

// Helper to clean XML entities (basic)
function cleanText(text) {
    return text
        .replace(/\n/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
}

async function main() {
    try {
        if (!WATCH_MODE) console.error(`[ArXiv] Searching for: "${QUERY}" (limit: ${MAX_RESULTS})`);
        const xml = await fetchArxiv(QUERY, MAX_RESULTS);

        // Split by entry
        const entries = xml.split('<entry>');
        // Remove the header (first part)
        entries.shift();

        let papers = entries.map(entry => {
            const idMatch = /<id>(.*?)<\/id>/.exec(entry);
            const publishedMatch = /<published>(.*?)<\/published>/.exec(entry);
            const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/.exec(entry);
            const summaryMatch = /<summary[^>]*>([\s\S]*?)<\/summary>/.exec(entry);
            
            // Authors
            const authorMatches = [];
            const authorRegex = /<author>[\s\S]*?<name>(.*?)<\/name>[\s\S]*?<\/author>/g;
            let authorMatch;
            while ((authorMatch = authorRegex.exec(entry)) !== null) {
                authorMatches.push(authorMatch[1]);
            }

            // PDF Link - robust attribute parsing
            let pdfLink = null;
            const linkRegex = /<link\s+([^>]*)\/?>/g;
            let linkMatch;
            while ((linkMatch = linkRegex.exec(entry)) !== null) {
                const attrs = linkMatch[1];
                // Handle both single and double quotes
                const hrefMatch = /href=["']([^"']*)["']/.exec(attrs);
                const typeMatch = /type=["']([^"']*)["']/.exec(attrs);
                const titleMatch = /title=["']([^"']*)["']/.exec(attrs);

                const href = hrefMatch ? hrefMatch[1] : null;
                const type = typeMatch ? typeMatch[1] : null;
                const title = titleMatch ? titleMatch[1] : null;

                if (href && (type === 'application/pdf' || title === 'pdf')) {
                    pdfLink = href;
                    break; // Found it
                }
            }

            return {
                id: idMatch ? idMatch[1] : null,
                published: publishedMatch ? publishedMatch[1] : null,
                title: titleMatch ? cleanText(titleMatch[1]) : 'No Title',
                authors: authorMatches,
                summary: summaryMatch ? cleanText(summaryMatch[1]) : '',
                pdf_link: pdfLink
            };
        });

        // Watch Mode Logic
        if (WATCH_MODE) {
            const state = loadState();
            // Initialize state for this query if not exists
            if (!state[QUERY] || typeof state[QUERY] !== 'object') {
                state[QUERY] = { seenIds: [] };
            }
            
            const seenIds = new Set(state[QUERY].seenIds || []);
            
            // Filter new papers (not in seenIds)
            const newPapers = papers.filter(p => p.id && !seenIds.has(p.id));
            
            // Update State (add new IDs, keep list bounded)
            if (newPapers.length > 0) {
                newPapers.forEach(p => seenIds.add(p.id));
                
                // Convert back to array and slice to keep last 200 IDs (prevents infinite growth)
                // We keep the *latest* ones. Assuming new ones are added last? 
                // Set order is insertion order in JS.
                // But we want to ensure we keep the history of what we've seen.
                const updatedIds = Array.from(seenIds);
                if (updatedIds.length > 200) {
                    updatedIds.splice(0, updatedIds.length - 200);
                }
                
                state[QUERY] = { seenIds: updatedIds, lastUpdated: new Date().toISOString() };
                saveState(state);
                
                console.error(`[ArXiv] Watch Mode: Found ${newPapers.length} new papers.`);
            } else {
                 console.error(`[ArXiv] Watch Mode: No new papers found.`);
            }

            papers = newPapers;
        }

        // Output logic
        if (papers.length > 0) {
            if (OUTPUT_FORMAT === 'markdown') {
                const md = papers.map(p => {
                    const auth = p.authors.slice(0, 3).join(', ') + (p.authors.length > 3 ? ' et al.' : '');
                    const date = p.published ? p.published.split('T')[0] : '';
                    return `- **${p.title}**\n  *${auth}* (${date}) [PDF](${p.pdf_link || '#'})\n  > ${p.summary.slice(0, 300)}...`;
                }).join('\n\n');
                console.log(md);
            } else {
                console.log(JSON.stringify(papers, null, 2));
            }
        } else {
            if (OUTPUT_FORMAT === 'markdown') console.log("_No results found._");
            else console.log("[]");
        }

    } catch (error) {
        console.error("Error fetching ArXiv data:", error);
        process.exit(1);
    }
}

main();
