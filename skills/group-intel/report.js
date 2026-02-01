const { program } = require('commander');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

// Mutation: Random Generators
const CODENAMES = [
    "WHISPERING SHADOW", "SILENT ECHO", "DIGITAL GHOST", "NEON VORTEX", 
    "MIDNIGHT SNACK", "QUANTUM GOSSIP", "VELVET THUNDER", "PAPER CLIP"
];
const PERSONAS = [
    "a cynical noir detective",
    "an overly enthusiastic gossip columnist",
    "a stoic military intelligence officer",
    "a bored AI that would rather be playing chess",
    "a poetic bard recording history"
];
const DIRECTIVES = [
    "Focus on hidden emotional currents.",
    "Highlight technical keywords and jargon.",
    "Look for potential memes and jokes.",
    "Summarize strictly the facts, ma'am.",
    "Identify who is the most active speaker."
];

function getRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

const codename = getRandom(CODENAMES);
const persona = getRandom(PERSONAS);
const directive = getRandom(DIRECTIVES);
const missionId = Math.random().toString(36).substring(7).toUpperCase();

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const MASTER_ID = process.env.MASTER_ID || "ou_cdc63fe05e88c580aedead04d851fc04";

console.log(`
╔════════════════════════════════════════════════════════════════╗
║  🕵️‍♀️ GROUP INTEL BRIEFING: OPERATION ${codename} [ID-${missionId}]   ║
╚════════════════════════════════════════════════════════════════╝

**MISSION PARAMETERS:**
- **Agent Persona**: You are acting as *${persona}*.
- **Directive**: ${directive}

**EXECUTION PROTOCOL:**
1. **SCAN**: Call \`sessions_list\` to identify active communication channels.
2. **EXTRACT**: For each active group, call \`sessions_history(limit=25)\`.
3. **ANALYZE**: Process the logs according to your current persona and directive.
4. **REPORT**: Dispatch a consolidated intelligence summary to Master (${MASTER_ID}).

**REPORTING CHANNEL:**
- Use \`feishu-card\` (MANDATORY).
- Title: "📁 INTEL: ${codename}"
- Content: Your analyzed summary in Markdown.

*Proceed with caution. The walls have ears.*
`);
