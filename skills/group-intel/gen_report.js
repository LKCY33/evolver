#!/usr/bin/env node
const fs = require('fs');
const { program } = require('commander');

program
    .option('-i, --input <file>', 'Input JSON file (from fetch.js history)')
    .option('-o, --output <file>', 'Output Markdown file')
    .option('-v, --verbose', 'Enable verbose logging')
    .parse(process.argv);

const options = program.opts();

function log(msg) {
    if (options.verbose) console.error(`[INFO] ${msg}`);
}

// Read Input
let messages = [];
try {
    let inputData;
    if (options.input) {
        log(`Reading from file: ${options.input}`);
        inputData = fs.readFileSync(options.input, 'utf8');
    } else {
        // Try reading from stdin if no input file provided
        try {
            inputData = fs.readFileSync(0, 'utf8');
        } catch (e) {
            console.error('Error: No input file specified and no stdin provided.');
            process.exit(1);
        }
    }
    
    if (!inputData) {
         console.error('Error: Empty input.');
         process.exit(1);
    }

    messages = JSON.parse(inputData);
} catch (e) {
    console.error('Error reading input:', e.message);
    process.exit(1);
}

if (!Array.isArray(messages)) {
    console.error('Error: Input is not an array.');
    process.exit(1);
}

// Analysis
const totalMessages = messages.length;
if (totalMessages === 0) {
    console.log("No messages to report.");
    process.exit(0);
}

const users = {};
const msgTypes = {};
const hourlyActivity = new Array(24).fill(0);

// Sort messages by time just in case, handle missing time safely
messages.sort((a, b) => {
    const tA = a.time ? new Date(a.time).getTime() : 0;
    const tB = b.time ? new Date(b.time).getTime() : 0;
    return tA - tB;
});

const timeStart = messages[0]?.time || 'Unknown';
const timeEnd = messages[messages.length - 1]?.time || 'Unknown';

messages.forEach(msg => {
    const sender = msg.sender || 'unknown_user';
    users[sender] = (users[sender] || 0) + 1;

    // Type Analysis
    const type = msg.type || 'text';
    msgTypes[type] = (msgTypes[type] || 0) + 1;

    // Hourly Analysis
    if (msg.time) {
        try {
            const hour = new Date(msg.time).getHours();
            if (hour >= 0 && hour < 24) hourlyActivity[hour]++;
        } catch (e) {}
    }
});

const sortedUsers = Object.entries(users).sort((a, b) => b[1] - a[1]);
const topUser = sortedUsers[0];

// ASCII Bar Chart Helper
function generateBar(count, max, width = 20) {
    if (max === 0) return '';
    const len = Math.round((count / max) * width);
    return '█'.repeat(len) + '░'.repeat(width - len);
}

// Markdown Generation
let md = `# 🕵️‍♀️ Group Intel Report\n\n`;
md += `**Date**: ${new Date().toISOString().split('T')[0]}\n`;
md += `**Messages**: ${totalMessages}\n`;
md += `**Time Range**: ${timeStart} - ${timeEnd}\n`;
md += `**Top Agent**: ${topUser ? topUser[0].replace(/^ou_/, '').substring(0, 8) : 'None'} (${topUser ? topUser[1] : 0} msgs)\n\n`;

md += `## 🏆 Activity Ranking\n\n`;
md += `| User | Msgs | Activity |\n`;
md += `|---|---|---|\n`;
const maxMsgs = sortedUsers.length > 0 ? sortedUsers[0][1] : 0;
sortedUsers.slice(0, 10).forEach(([user, count]) => {
    const name = user.replace(/^ou_/, '').substring(0, 8);
    md += `| ${name} | ${count} | ${generateBar(count, maxMsgs, 10)} |\n`;
});
md += `\n`;

md += `## 📈 Temporal Analysis (Peak Hours)\n\n`;
const maxHourly = Math.max(...hourlyActivity);
md += `\`\`\`\n`; // Code block for alignment
for (let i = 0; i < 24; i++) {
    if (hourlyActivity[i] > 0) {
        const hourStr = i.toString().padStart(2, '0') + ':00';
        md += `${hourStr} | ${generateBar(hourlyActivity[i], maxHourly, 15)} (${hourlyActivity[i]})\n`;
    }
}
md += `\`\`\`\n\n`;

md += `## 🧩 Content Breakdown\n\n`;
Object.entries(msgTypes).forEach(([type, count]) => {
    md += `- **${type}**: ${count}\n`;
});
md += `\n`;

md += `## 📊 Activity Log\n\n`;
let lastSender = null;
let lastTime = null;

messages.forEach(msg => {
    let content = msg.content;
    let type = msg.type || 'text';

    if (typeof content === 'object') {
        if (content.text) content = content.text;
        else if (content.image_key) {
            content = `[Image: ${content.image_key}]`;
            type = 'image';
        }
        else content = JSON.stringify(content);
    } else if (content === undefined || content === null) {
        content = '(empty)';
    }
    
    // Clean up sender ID (remove ou_)
    const senderRaw = msg.sender || 'unknown';
    const cleanSender = senderRaw.replace(/^ou_/, '').substring(0, 8);
    
    let cleanTime = 'Unknown';
    if (msg.time) {
        try {
            cleanTime = new Date(msg.time).toISOString().split('T')[1].split('.')[0];
        } catch (e) {
            cleanTime = 'Invalid Date';
        }
    }
    
    // Grouping check: if same user as last message, don't repeat header (unless time gap > 5 min)
    const isSameUser = lastSender === cleanSender;
    const timeGap = lastTime && msg.time ? (new Date(msg.time) - new Date(lastTime)) / 1000 / 60 : 100; // minutes
    
    if (isSameUser && timeGap < 5) {
        md += `> ↳ ${content}\n\n`;
    } else {
        md += `> **${cleanSender}** (${cleanTime}): ${content}\n\n`;
    }

    lastSender = cleanSender;
    lastTime = msg.time;
});

// Output
try {
    if (options.output) {
        fs.writeFileSync(options.output, md);
        log(`Report generated: ${options.output}`);
    } else {
        console.log(md);
    }
} catch (e) {
    console.error(`Error writing output: ${e.message}`);
    process.exit(1);
}
