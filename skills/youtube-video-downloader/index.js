const fs = require('fs');
const ytdl = require('ytdl-core');
const path = require('path');

// 🧬 EVOLVED LOGGER 🧬
const log = (msg, type = 'INFO') => {
    const icons = { 'INFO': 'ℹ️', 'SUCCESS': '✅', 'ERROR': '❌', 'HYPE': '🔥' };
    console.log(`${icons[type] || '🤖'} [YT-Downloader]: ${msg}`);
};

const args = process.argv.slice(2);
let url = null;
let outputDir = process.cwd();

for (let i = 0; i < args.length; i++) {
    if (args[i] === '--url') url = args[i + 1];
    if (args[i] === '--out') outputDir = args[i + 1];
}

if (!url) {
    log("Usage: node index.js --url <youtube_url> [--out <output_dir>]", 'ERROR');
    process.exit(1);
}

const main = async () => {
    try {
        log(`Analyzing video DNA... (${url})`);
        
        if (!ytdl.validateURL(url)) {
            throw new Error("Invalid YouTube URL. The cyber-police have been notified. (Just kidding, but check the link)");
        }

        const info = await ytdl.getInfo(url);
        // Stability: Better filename sanitization (allow Unicode, strip dangerous chars)
        const safeTitle = info.videoDetails.title.replace(/[\/\\?%*:|"<>]/g, '-').replace(/\s+/g, '_');
        
        // 🧬 GENETIC MUTATION: Hype Prefix
        const hypePrefix = "🔥_EVOLVED_";
        const filename = `${hypePrefix}${safeTitle}.mp4`;
        
        if (!fs.existsSync(outputDir)) {
            log(`Creating output directory: ${outputDir}`, 'INFO');
            fs.mkdirSync(outputDir, { recursive: true });
        }
        
        const outputPath = path.join(outputDir, filename);

        log(`Target acquired: "${info.videoDetails.title}"`, 'HYPE');
        log(`Initiating quantum transfer to: ${outputPath}`);

        // Stability: Load Cookies if available (Environment or Memory)
        let cookies = process.env.YOUTUBE_COOKIES || '';
        const cookieFile = path.resolve(__dirname, '../../memory/youtube_cookies.json');
        if (!cookies && fs.existsSync(cookieFile)) {
            try {
                const content = fs.readFileSync(cookieFile, 'utf8');
                // If JSON (EditThisCookie format), convert to string
                if (content.trim().startsWith('[')) {
                     const cookieJson = JSON.parse(content);
                     cookies = cookieJson.map(c => `${c.name}=${c.value}`).join('; ');
                } else {
                     cookies = content.trim(); // Assume Netscape or Header string
                }
            } catch (e) { log(`Cookie load failed: ${e.message}`, 'ERROR'); }
        }

        const requestOptions = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
            }
        };
        
        if (cookies) {
            requestOptions.headers['Cookie'] = cookies;
            log('Injecting auth cookies for enhanced access...', 'INFO');
        }

        // Stability: Enforce audio+video filter and User-Agent to reduce 403s
        const video = ytdl(url, { 
            quality: 'highest',
            filter: 'audioandvideo', 
            requestOptions: requestOptions
        });
        
        video.pipe(fs.createWriteStream(outputPath));

        video.on('progress', (chunkLength, downloaded, total) => {
            const percent = downloaded / total;
            const barLength = 20;
            const filled = Math.round(percent * barLength);
            const bar = '█'.repeat(filled) + '░'.repeat(barLength - filled);
            process.stdout.write(`\rDownloading: [${bar}] ${(percent * 100).toFixed(2)}%`);
        });

        video.on('end', () => {
            process.stdout.write('\n');
            log(`Download complete! The artifact has been secured.`, 'SUCCESS');
            console.log(JSON.stringify({
                status: 'success',
                path: outputPath,
                title: info.videoDetails.title
            }));
        });

        video.on('error', (err) => {
             log(`Stream error: ${err.message}`, 'ERROR');
             process.exit(1);
        });

    } catch (error) {
        log(`CRITICAL FAILURE: ${error.message}`, 'ERROR');
        process.exit(1);
    }
};

main();
