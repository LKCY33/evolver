const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
const path = require("path");
const { execSync } = require('child_process');

// Try to resolve ffmpeg-static from workspace root
let ffmpegPath;
try {
    ffmpegPath = require('ffmpeg-static');
} catch (e) {
    try {
        ffmpegPath = require(path.resolve(__dirname, '../../node_modules/ffmpeg-static'));
    } catch (e2) {
        console.warn('Warning: ffmpeg-static not found. GIF conversion will fail.');
    }
}

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') }); // Load workspace .env

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
    console.error("Error: GEMINI_API_KEY not set");
    process.exit(1);
}

const STICKER_DIR = process.env.STICKER_DIR || "/home/crishaocredits/.openclaw/media/stickers";
const TRASH_DIR = path.join(STICKER_DIR, "trash");
const INDEX_FILE = path.join(STICKER_DIR, 'index.json');

const genAI = new GoogleGenerativeAI(API_KEY);

// Use the specific model found via curl or fallback, allow env override
const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const model = genAI.getGenerativeModel({ model: MODEL_NAME });

// Concurrency limit
const CONCURRENCY = 3;

if (!fs.existsSync(TRASH_DIR)) fs.mkdirSync(TRASH_DIR, { recursive: true });

function fileToGenerativePart(path, mimeType) {
  return {
    inlineData: {
      data: fs.readFileSync(path).toString("base64"),
      mimeType,
    },
  };
}

// Robust JSON parser
function parseGeminiJson(text) {
    try {
        // Remove markdown code blocks
        let clean = text.replace(/```json/g, "").replace(/```/g, "").trim();
        // Sometimes Gemini puts extra text, try to find the first { and last }
        const firstBrace = clean.indexOf('{');
        const lastBrace = clean.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1) {
            clean = clean.substring(firstBrace, lastBrace + 1);
        }
        return JSON.parse(clean);
    } catch (e) {
        return null;
    }
}

// Atomic write to prevent corruption
function saveIndex(index) {
    const tempFile = `${INDEX_FILE}.tmp`;
    try {
        fs.writeFileSync(tempFile, JSON.stringify(index, null, 2));
        fs.renameSync(tempFile, INDEX_FILE);
    } catch (e) {
        console.error("Failed to save index atomically:", e.message);
    }
}

async function analyzeFile(file, index) {
    let filePath = path.join(STICKER_DIR, file);
    // Determine mime type
    const ext = path.extname(file).toLowerCase();
    let mimeType = ext === ".png" ? "image/png" : (ext === ".webp" ? "image/webp" : "image/jpeg");
    let currentFile = file;

    // GIF Handling
    if (ext === '.gif') {
        if (!ffmpegPath) {
            console.log(`[SKIP] ${file} (no ffmpeg)`);
            return;
        }
        
        const webpPath = filePath.replace(/\.gif$/i, '.webp');
        // Check if we already converted it but maybe index was lost?
        if (fs.existsSync(webpPath)) {
             // Use the existing conversion
             console.log(`[ reusing ] Found existing conversion for ${file}`);
             filePath = webpPath;
             currentFile = path.basename(webpPath);
             mimeType = "image/webp";
        } else {
            console.log(`[ converting ] ${file} -> WebP`);
            try {
                execSync(`${ffmpegPath} -i "${filePath}" -c:v libwebp -lossless 0 -q:v 75 -loop 0 -an -vsync 0 -y "${webpPath}"`, { stdio: 'pipe' });
                // Delete original GIF only if conversion success
                if (fs.existsSync(webpPath)) {
                    fs.unlinkSync(filePath); 
                    filePath = webpPath;
                    currentFile = path.basename(webpPath);
                    mimeType = "image/webp";
                } else {
                    throw new Error("Conversion failed (no output file)");
                }
            } catch (e) {
                console.error(`[ ERROR ] Failed to convert ${file}: ${e.message}`);
                return;
            }
        }
        
        if (index[currentFile]) {
            console.log(`[ skip ] ${currentFile} is already indexed.`);
            return; 
        }
    }

    console.log(`[ analyzing ] ${currentFile}`);

    try {
      const prompt = `Analyze this image for a sticker/meme database.
      Task: Determine if this is a usable "sticker" (expressive, meme, character) or just a random screenshot/photo.
      
      Output JSON ONLY: 
      {
        "is_sticker": boolean, 
        "emotion": "string (e.g., happy, smug, angry, crying) or null",
        "keywords": ["tag1", "tag2"]
      }`;

      const imagePart = fileToGenerativePart(filePath, mimeType);
      
      // Add timeout to fetch
      const result = await Promise.race([
          model.generateContent([prompt, imagePart]),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 20000))
      ]);
      
      const response = await result.response;
      const text = response.text();
      const analysis = parseGeminiJson(text);

      if (!analysis) {
          console.error(`[ FAIL ] JSON parse error for ${currentFile}. Raw: ${text.slice(0, 50)}...`);
          return;
      }

      if (!analysis.is_sticker) {
        console.log(`[ 🗑️ TRASH ] ${currentFile} (Not a sticker)`);
        // Safely move to trash (rename if exists)
        const trashPath = path.join(TRASH_DIR, currentFile);
        if (fs.existsSync(trashPath)) fs.unlinkSync(trashPath);
        fs.renameSync(filePath, trashPath);
        
        if (index[currentFile]) delete index[currentFile]; 
      } else {
        console.log(`[ ✅ INDEX ] ${currentFile}: ${analysis.emotion}`);
        
        index[currentFile] = {
            path: filePath,
            emotion: analysis.emotion,
            keywords: analysis.keywords || [],
            addedAt: Date.now()
        };
      }
      return true; // Signal that index changed

    } catch (e) {
      console.error(`[ ERROR ] ${currentFile}:`, e.message);
      return false;
    }
}

async function run() {
  // Load Index
  let index = {};
  if (fs.existsSync(INDEX_FILE)) {
      try { index = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8')); } catch (e) {
          console.error("Failed to parse index.json. Backing up and starting fresh.");
          if (fs.existsSync(INDEX_FILE)) fs.renameSync(INDEX_FILE, INDEX_FILE + '.bak');
      }
  }

  let allFiles = [];
  try {
      allFiles = fs.readdirSync(STICKER_DIR);
  } catch (e) {
      console.error(`Error reading directory ${STICKER_DIR}:`, e.message);
      return;
  }
  
  // 1. Cleanup Stale Entries
  let dirty = false;
  const initialIndexCount = Object.keys(index).length;
  for (const key of Object.keys(index)) {
      if (!allFiles.includes(key)) {
          // Check if file really missing (maybe readdir missed it? unlikely)
          if (!fs.existsSync(path.join(STICKER_DIR, key))) {
              delete index[key];
              dirty = true;
          }
      }
  }
  if (dirty) console.log(`Cleaned up ${initialIndexCount - Object.keys(index).length} stale entries.`);

  // 2. Filter Files
  const filesToProcess = allFiles.filter(file => {
    const ext = path.extname(file).toLowerCase();
    const isImage = [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext);
    // Optimization: Don't stat every file if we don't have to. trust readdir usually.
    // But we need to filter directories.
    // Let's rely on extension primarily, and try/catch inside analyze.
    
    // Skip if in index (unless it's a GIF that needs conversion)
    if (index[file]) return false;
    
    // If it's a GIF, we process it (to convert it).
    // If it's an image and not in index, we process it.
    return isImage;
  });

  console.log(`Found ${filesToProcess.length} pending files.`);

  if (filesToProcess.length === 0) {
      if (dirty) saveIndex(index);
      return;
  }

  // 3. Batched Processing
  for (let i = 0; i < filesToProcess.length; i += CONCURRENCY) {
      const batch = filesToProcess.slice(i, i + CONCURRENCY);
      console.log(`Processing batch ${i + 1}-${Math.min(i + CONCURRENCY, filesToProcess.length)} / ${filesToProcess.length}`);
      
      const promises = batch.map(file => analyzeFile(file, index));
      const results = await Promise.all(promises);
      
      // Save if any change in batch
      if (results.some(Boolean)) {
          saveIndex(index);
      }
      
      // Short delay between batches
      await new Promise(r => setTimeout(r, 1000));
  }
  
  console.log("Analysis complete.");
}

run();
