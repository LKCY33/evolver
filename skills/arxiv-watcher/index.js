// skills/arxiv-watcher/index.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ARGS = process.argv.slice(2);

// Cache Configuration
const CACHE_DIR = path.resolve(__dirname, '../../memory/arxiv_cache');
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

function getCacheKey(query, max) {
    return crypto.createHash('md5').update(`${query}_${max}`).digest('hex');
}

// ... (rest of parsing) ...

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
        
        // Cache Logic
        const cacheKey = getCacheKey(QUERY, MAX_RESULTS);
        const cacheFile = path.join(CACHE_DIR, `${cacheKey}.xml`);
        let xml = null;

        // 1. Try Cache
        if (fs.existsSync(cacheFile)) {
            const stats = fs.statSync(cacheFile);
            if (Date.now() - stats.mtimeMs < CACHE_TTL) {
                if (!WATCH_MODE) console.error(`[ArXiv] Cache Hit (${cacheKey}).`);
                xml = fs.readFileSync(cacheFile, 'utf8');
            }
        }

        // 2. Fetch if missing
        if (!xml) {
             // Enforce Rate Limit Delay (Safety)
             // We can't know when the last request was across processes, but the cache helps.
             // We just add a small jitter delay to prevent synchronized bursts.
             await new Promise(r => setTimeout(r, Math.random() * 2000));
             
             xml = await fetchArxiv(QUERY, MAX_RESULTS);
             try { fs.writeFileSync(cacheFile, xml); } catch(e) {}
             if (!WATCH_MODE) console.error(`[ArXiv] Cache Updated.`);
        }

        // Split by entry
        const entries = xml.split('<entry>');
        // Remove the header (first part)
        entries.shift();

        let papers = entries.map(entry => {
            const idMatch = /<id>(.*?)<\/id>/.exec(entry);
            const publishedMatch = /<published>(.*?)<\/published>/.exec(entry);
            const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/.exec(entry);
            const summaryMatch = /<summary[^>]*>([\s\S]*?)<\/summary>/.exec(entry);
            
            // Category extraction (arxiv:primary_category or generic category)
            const categoryMatch = /<arxiv:primary_category[^>]*term=["']([^"']+)["']/.exec(entry) || /<category[^>]*term=["']([^"']+)["']/.exec(entry);
            const category = categoryMatch ? categoryMatch[1] : 'CS'; // Default to CS if missing

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
                category: category,
                authors: authorMatches,
                summary: summaryMatch ? cleanText(summaryMatch[1]) : '',
                pdf_link: pdfLink
            };
        });

        // Date Filtering
        if (DAYS_FILTER) {
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - DAYS_FILTER);
            const initialCount = papers.length;
            papers = papers.filter(p => new Date(p.published) >= cutoff);
            if (!WATCH_MODE) console.error(`[ArXiv] Date Filter: Kept ${papers.length}/${initialCount} papers (Last ${DAYS_FILTER} days).`);
        }

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
                
                // Trigger Notification
                if (NOTIFY_TARGET) {
                    sendNotification(newPapers, NOTIFY_TARGET);
                }
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
                    return `- **${p.title}**\n  *${auth}* | \`${p.category}\` | ${date} | [PDF](${p.pdf_link || '#'})\n  > ${p.summary.slice(0, 300)}...`;
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
