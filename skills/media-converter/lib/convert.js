const Jimp = require('jimp');
const path = require('path');
const { spawnSync } = require('child_process');
const fs = require('fs');

// Resolve ffmpeg path (Priority: Local Static > Node Module > System Path)
let ffmpegPath;

const localStaticPath = path.resolve(__dirname, '../../../bin/ffmpeg');
if (fs.existsSync(localStaticPath)) {
    ffmpegPath = localStaticPath;
} else {
    try {
        ffmpegPath = require('ffmpeg-static');
    } catch (e) {
        try {
            ffmpegPath = require(path.resolve(__dirname, '../../../node_modules/ffmpeg-static'));
        } catch (e2) {
            // Fallback to system command 'ffmpeg'
            const sysCheck = spawnSync('ffmpeg', ['-version']);
            if (sysCheck.status === 0) {
                ffmpegPath = 'ffmpeg';
            }
        }
    }
}

/**
 * Convert a GIF to a static PNG (first frame) via Jimp
 * @param {string} inputPath 
 * @returns {Promise<string>} Path to the new PNG file
 */
async function gifToPng(inputPath) {
    try {
        const image = await Jimp.read(inputPath);
        const dir = path.dirname(inputPath);
        const name = path.basename(inputPath, path.extname(inputPath));
        const outputPath = path.join(dir, `${name}_converted.png`);
        await image.writeAsync(outputPath);
        return outputPath;
    } catch (error) {
        throw new Error(`Failed to convert GIF to PNG: ${error.message}`);
    }
}

/**
 * Convert media to WebP using ffmpeg (if available)
 * @param {string} inputPath 
 * @returns {Promise<string>} Path to the new WebP file
 */
async function toWebP(inputPath) {
    if (!ffmpegPath) {
        throw new Error("FFmpeg not available for WebP conversion");
    }

    const dir = path.dirname(inputPath);
    const name = path.basename(inputPath, path.extname(inputPath));
    const outputPath = path.join(dir, `${name}.webp`);

    // Basic ffmpeg conversion to webp
    // -y: overwrite
    // -c:v libwebp: use webp codec
    // -q:v 75: quality
    // -loop 0: preserve looping if gif
    const args = ['-i', inputPath, '-c:v', 'libwebp', '-q:v', '75', '-loop', '0', '-y', outputPath];
    
    // Check if input is gif to decide specific flags? 
    // ffmpeg handles most automatically.
    
    try {
        const result = spawnSync(ffmpegPath, args, { stdio: 'pipe' });
        if (result.status !== 0) {
            throw new Error(`FFmpeg exited with code ${result.status}: ${result.stderr.toString()}`);
        }
        if (!fs.existsSync(outputPath)) {
            throw new Error("FFmpeg finished but output file missing");
        }
        return outputPath;
    } catch (error) {
        throw new Error(`WebP conversion failed: ${error.message}`);
    }
}

/**
 * Extract audio from video to MP3
 * @param {string} inputPath 
 * @returns {Promise<string>} Path to the new MP3 file
 */
async function extractAudio(inputPath) {
    if (!ffmpegPath) throw new Error("FFmpeg not available");
    const dir = path.dirname(inputPath);
    const name = path.basename(inputPath, path.extname(inputPath));
    const outputPath = path.join(dir, `${name}.mp3`);

    const args = ['-i', inputPath, '-q:a', '0', '-map', 'a', '-y', outputPath];
    
    const result = spawnSync(ffmpegPath, args, { stdio: 'pipe' });
    if (result.status !== 0) {
        throw new Error(`FFmpeg exited with code ${result.status}: ${result.stderr.toString()}`);
    }
    return outputPath;
}

/**
 * Convert video to GIF
 * @param {string} inputPath 
 * @returns {Promise<string>} Path to the new GIF file
 */
async function videoToGif(inputPath) {
    if (!ffmpegPath) throw new Error("FFmpeg not available");
    const dir = path.dirname(inputPath);
    const name = path.basename(inputPath, path.extname(inputPath));
    const outputPath = path.join(dir, `${name}.gif`);

    const args = ['-i', inputPath, '-vf', 'fps=15,scale=320:-1:flags=lanczos', '-y', outputPath];
    
    const result = spawnSync(ffmpegPath, args, { stdio: 'pipe' });
    if (result.status !== 0) {
        throw new Error(`FFmpeg exited with code ${result.status}: ${result.stderr.toString()}`);
    }
    return outputPath;
}

module.exports = { gifToPng, toWebP, extractAudio, videoToGif, hasFfmpeg: !!ffmpegPath };
