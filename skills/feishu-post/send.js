#!/usr/bin/env node
const fs = require('fs');
const { program } = require('commander');
const path = require('path');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

// Credentials
const APP_ID = process.env.FEISHU_APP_ID;
const APP_SECRET = process.env.FEISHU_APP_SECRET;
const TOKEN_CACHE_FILE = path.resolve(__dirname, '../../memory/feishu_token.json');

// Helper: Atomic JSON Write
function writeJsonAtomic(filePath, data) {
    try {
        const tempPath = `${filePath}.tmp.${Date.now()}`;
        fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
        fs.renameSync(tempPath, filePath);
    } catch (e) {}
}

if (!APP_ID || !APP_SECRET) {
    console.error('Error: FEISHU_APP_ID or FEISHU_APP_SECRET not set.');
    process.exit(1);
}

// Helper: Fetch with retry
async function fetchWithRetry(url, options, retries = 3, timeoutMs = 15000) {
    for (let i = 0; i < retries; i++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const res = await fetch(url, { ...options, signal: controller.signal });
            clearTimeout(timeoutId);
            if (res.ok) return res;
            if (res.status === 429) {
                await new Promise(r => setTimeout(r, 2000));
                continue;
            }
            if (res.status >= 400 && res.status < 500) throw new Error(`HTTP ${res.status}`);
            throw new Error(`HTTP ${res.status}`);
        } catch (e) {
            clearTimeout(timeoutId);
            if (i === retries - 1) throw e;
            await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
        }
    }
}

async function getToken(forceRefresh = false) {
    try {
        if (!forceRefresh && fs.existsSync(TOKEN_CACHE_FILE)) {
            const cached = JSON.parse(fs.readFileSync(TOKEN_CACHE_FILE, 'utf8'));
            if (cached.expire > Math.floor(Date.now() / 1000) + 300) return cached.token;
        }
    } catch (e) {}

    try {
        const res = await fetchWithRetry('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ app_id: APP_ID, app_secret: APP_SECRET })
        });
        const data = await res.json();
        if (!data.tenant_access_token) throw new Error('No token');
        
        writeJsonAtomic(TOKEN_CACHE_FILE, {
            token: data.tenant_access_token,
            expire: Math.floor(Date.now() / 1000) + data.expire 
        });
        return data.tenant_access_token;
    } catch (e) {
        process.exit(1);
    }
}

// Helper: Parse Inline Markdown (Bold, Italic, Strike, Link, Code)
// Returns array of element objects for a single line
function parseInlineMarkdown(text) {
    const elements = [];
    let currentText = '';
    let i = 0;
    
    // Simple state machine or regex approach?
    // Regex is easier for simple nesting.
    // Order: Code(`) -> Bold(**) -> Italic(*) -> Strike(~~) -> Link([])
    // We process sequentially.
    
    // Actually, splitting by regex is safer.
    // Regex for tokens: 
    // 1. `code`
    // 2. **bold**
    // 3. *italic*
    // 4. ~~strike~~
    // 5. [text](url)
    // 6. <at user_id="xxx">name</at> (Feishu specific)
    
    const regex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|~~[^~]+~~|\[[^\]]+\]\([^)]+\)|<at.*?>.*?<\/at>)/g;
    const parts = text.split(regex);
    
    parts.forEach(part => {
        if (!part) return;
        
        // Inline Code -> Italic (User Preference)
        if (part.startsWith('`') && part.endsWith('`')) {
            elements.push({ tag: 'text', text: part.slice(1, -1), style: ['italic'] });
        }
        // Bold
        else if (part.startsWith('**') && part.endsWith('**')) {
            elements.push({ tag: 'text', text: part.slice(2, -2), style: ['bold'] });
        }
        // Italic
        else if (part.startsWith('*') && part.endsWith('*')) {
            elements.push({ tag: 'text', text: part.slice(1, -1), style: ['italic'] });
        }
        // Strike
        else if (part.startsWith('~~') && part.endsWith('~~')) {
            elements.push({ tag: 'text', text: part.slice(2, -2), style: ['lineThrough'] });
        }
        // Link
        else if (part.startsWith('[') && part.includes('](') && part.endsWith(')')) {
            const match = part.match(/\[(.*?)\]\((.*?)\)/);
            if (match) {
                elements.push({ tag: 'a', text: match[1], href: match[2] });
            } else {
                elements.push({ tag: 'text', text: part });
            }
        }
        // At (Feishu) - pass through or parse? 
        // For now treat as text, Feishu might auto-parse plain text @ mentions if at_user=true?
        // Post structure supports <at> tag: { tag: 'at', user_id: '...' }
        else if (part.startsWith('<at')) {
             const match = part.match(/user_id="(.*?)".*?>(.*?)<\/at>/);
             if (match) {
                 elements.push({ tag: 'at', user_id: match[1] });
             } else {
                 elements.push({ tag: 'text', text: part });
             }
        }
        // Plain Text
        else {
            elements.push({ tag: 'text', text: part });
        }
    });
    
    return elements;
}

// Markdown to Rich Text Parser
function parseMarkdownToRichText(text) {
    const lines = text.split(/\r?\n/);
    const content = [];
    let inCodeBlock = false;
    let codeLanguage = '';
    let codeContent = '';

    for (const line of lines) {
        if (line.trim().startsWith('```')) {
            if (inCodeBlock) {
                content.push([{ tag: 'code_block', language: codeLanguage || 'text', text: codeContent.trimEnd() }]);
                inCodeBlock = false;
                codeContent = '';
            } else {
                inCodeBlock = true;
                codeLanguage = line.trim().substring(3).trim().toUpperCase(); // Feishu likes uppercase (JSON, JS)
            }
            continue;
        }
        if (inCodeBlock) {
            codeContent += line + '\n';
            continue;
        }
        
        // Use inline parser for non-code lines
        // Preserve empty lines for spacing
        if (line === '') {
             content.push([{ tag: 'text', text: '' }]);
             continue;
        }
        
        content.push(parseInlineMarkdown(line));
    }
    
    if (inCodeBlock && codeContent) {
        content.push([{ tag: 'code_block', language: codeLanguage || 'text', text: codeContent.trimEnd() }]);
    }
    return content;
}

async function sendPost(token, target, text, title) {
    const postContent = parseMarkdownToRichText(text);
    
    let receiveIdType = 'open_id';
    if (target.startsWith('oc_')) receiveIdType = 'chat_id';
    else if (target.startsWith('ou_')) receiveIdType = 'open_id';
    else if (target.includes('@')) receiveIdType = 'email';

    const contentPayload = {
        zh_cn: {
            content: postContent
        }
    };
    if (title) {
        contentPayload.zh_cn.title = title;
    }

    const messageBody = {
        receive_id: target,
        msg_type: 'post',
        content: JSON.stringify(contentPayload)
    };

    console.log(`Sending Post to ${target}...`);
    const res = await fetchWithRetry(
        `https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=${receiveIdType}`,
        {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(messageBody)
        }
    );
    const data = await res.json();
    console.log(JSON.stringify(data));
}

// CLI Setup
program
  .option('-t, --target <id>', 'Target ID')
  .option('-x, --text <text>', 'Text content')
  .option('-f, --text-file <path>', 'Text file path')
  .option('--title <title>', 'Title');

program.parse(process.argv);
const options = program.opts();

// Auto-Target Logic (Simplified)
function getAutoTarget() {
    if (options.target) return options.target;
    if (process.env.FEISHU_TARGET_ID) return process.env.FEISHU_TARGET_ID;
    try {
        if (fs.existsSync('../../memory/context.json')) {
            const ctx = JSON.parse(fs.readFileSync('../../memory/context.json'));
            return ctx.last_active_chat || ctx.last_active_user;
        }
    } catch(e) {}
    try {
        const userMd = fs.readFileSync(path.resolve(__dirname, '../../USER.md'), 'utf8');
        const match = userMd.match(/(?:Master|Owner).*?Feishu ID:.*?`(ou_[a-z0-9]+)`/s);
        if (match) return match[1];
    } catch(e) {}
    return null;
}

(async () => {
    let text = options.text;
    if (options.textFile) text = fs.readFileSync(options.textFile, 'utf8');
    if (!text && !process.stdin.isTTY) {
        text = '';
        for await (const chunk of process.stdin) text += chunk;
    }

    if (!text) {
        console.error('No text provided');
        process.exit(1);
    }

    const target = getAutoTarget();
    if (!target) {
        console.error('No target found');
        process.exit(1);
    }

    const token = await getToken();
    await sendPost(token, target, text, options.title);
})();
