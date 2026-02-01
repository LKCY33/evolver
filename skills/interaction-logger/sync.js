const fs = require('fs');
const path = require('path');

// Config
const AGENT_SESSIONS_DIR = '/home/crishaocredits/.openclaw/agents/main/sessions';
const HISTORY_FILE = path.resolve(__dirname, '../../memory/master_history.json');
const STATE_FILE = path.join(__dirname, 'sync_state.json');

// Helper: Get latest log file
function getLatestSessionFile() {
    if (!fs.existsSync(AGENT_SESSIONS_DIR)) return null;
    const files = fs.readdirSync(AGENT_SESSIONS_DIR)
        .filter(f => f.endsWith('.jsonl'))
        .map(f => ({ name: f, time: fs.statSync(path.join(AGENT_SESSIONS_DIR, f)).mtime.getTime() }))
        .sort((a, b) => b.time - a.time);
    return files.length ? path.join(AGENT_SESSIONS_DIR, files[0].name) : null;
}

// Helper: Read state
function getState() {
    if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    return { lastProcessedBytes: 0, lastFile: '' };
}

// Helper: Save state
function saveState(state) {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// Helper: Append to history
function appendToHistory(entries) {
    let data = { sessions: [] };
    if (fs.existsSync(HISTORY_FILE)) {
        try {
            data = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
        } catch (e) {}
    }
    if (!data.sessions) data.sessions = [];
    
    // Simple deduplication or just append?
    // We treat "sessions" as a flat list of interaction blocks or daily sessions?
    // The current structure seems to be { sessions: [ { timestamp, role, content } ] }
    // Let's stick to that flat structure for now.
    
    data.sessions.push(...entries);
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(data, null, 2));
}

async function run() {
    const sessionFile = getLatestSessionFile();
    if (!sessionFile) return;

    const state = getState();
    let startByte = 0;

    // If file changed, reset
    if (state.lastFile !== sessionFile) {
        state.lastFile = sessionFile;
        startByte = 0;
    } else {
        startByte = state.lastProcessedBytes;
    }

    const stats = fs.statSync(sessionFile);
    if (stats.size <= startByte) return; // Nothing new

    const stream = fs.createReadStream(sessionFile, { start: startByte });
    let buffer = '';
    
    const newEntries = [];

    for await (const chunk of stream) {
        buffer += chunk;
    }

    // Process buffer (line by line JSONL)
    const lines = buffer.split('\n');
    for (const line of lines) {
        if (!line.trim()) continue;
        try {
            const event = JSON.parse(line);
            // We want to capture: User messages and Assistant replies.
            // Format in JSONL: { type: 'message', message: { role: 'user'|'assistant', content: ... } }
            // Or tool results?
            
            // Note: OpenClaw JSONL format varies.
            // Usually: { type: 'message', ... }
            
            if (event.type === 'message' && event.message) {
                const msg = event.message;
                // Filter out empty or tool-only messages if needed?
                // Let's capture everything that has text.
                
                let content = '';
                if (typeof msg.content === 'string') content = msg.content;
                else if (Array.isArray(msg.content)) {
                    content = msg.content.map(c => c.text || '').join('');
                }
                
                if (content) {
                    newEntries.push({
                        timestamp: event.timestamp || new Date().toISOString(),
                        role: msg.role,
                        content: content
                    });
                }
            }
        } catch (e) {
            // Ignore parse errors (partial lines)
        }
    }

    if (newEntries.length > 0) {
        appendToHistory(newEntries);
        console.log(`Synced ${newEntries.length} messages.`);
    }

    state.lastProcessedBytes = stats.size;
    saveState(state);
}

run();
