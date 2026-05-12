import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { dialog } from 'electron';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import { spawn, execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.env.NODE_ENV === 'development';

// Client IDs e secrets configuráveis via interface
let TWITCH_CLIENT_ID = '';
let YOUTUBE_CLIENT_ID = '';
let YOUTUBE_CLIENT_SECRET = '';
const REDIRECT_URI = 'http://localhost';

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
    },
    autoHideMenuBar: true,
    backgroundColor: '#121212',
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5174');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

// ─── IPC: Client IDs ──────────────────────────────────────────────────────────
ipcMain.handle('save-client-ids', async (_event, { twitchId, youtubeId, youtubeSecret }) => {
  if (twitchId !== undefined) TWITCH_CLIENT_ID = twitchId;
  if (youtubeId !== undefined) YOUTUBE_CLIENT_ID = youtubeId;
  if (youtubeSecret !== undefined) YOUTUBE_CLIENT_SECRET = youtubeSecret;
  return true;
});

// ─── IPC: OAuth Twitch ────────────────────────────────────────────────────────
ipcMain.handle('login-twitch', async () => {
  if (!TWITCH_CLIENT_ID) {
    throw new Error('Client ID da Twitch não configurado. Preencha nas Configurações.');
  }
  return new Promise((resolve, reject) => {
    const authWindow = new BrowserWindow({
      width: 500, height: 700, show: true,
      webPreferences: { nodeIntegration: false, contextIsolation: true }
    });
    const authUrl = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=token&scope=user:read:email`;
    authWindow.loadURL(authUrl);
    let isResolved = false;
    const checkUrl = (urlStr) => {
      if (urlStr.startsWith(REDIRECT_URI)) {
        const hash = urlStr.split('#')[1];
        if (hash) {
          const params = new URLSearchParams(hash);
          const accessToken = params.get('access_token');
          if (accessToken) {
            isResolved = true;
            resolve(accessToken);
            authWindow.close();
            return true;
          }
        }
        if (!isResolved) {
          isResolved = true;
          reject('Falha ao autenticar.');
          authWindow.close();
        }
        return true;
      }
      return false;
    };
    authWindow.webContents.on('will-redirect', (event, newUrl) => {
      if (checkUrl(newUrl)) event.preventDefault();
    });
    authWindow.webContents.on('did-navigate', (event, newUrl) => checkUrl(newUrl));
    authWindow.on('closed', () => {
      if (!isResolved) reject('O usuário fechou a janela de login.');
    });
  });
});

// ─── IPC: OAuth YouTube ──────────────────────────────────────────────────────
ipcMain.handle('login-youtube', async () => {
  if (!YOUTUBE_CLIENT_ID) {
    throw new Error('Client ID do YouTube não configurado. Preencha nas Configurações.');
  }
  const http = (await import('http')).default;
  const YOUTUBE_REDIRECT_URI = 'http://localhost:8080';
  return new Promise((resolve, reject) => {
    let server = null;
    let authWindow = null;
    let isResolved = false;
    const cleanup = () => {
      try { server && server.close(); } catch {}
      try { authWindow && !authWindow.isDestroyed() && authWindow.close(); } catch {}
    };
    server = http.createServer((req, res) => {
      const urlObj = new URL(req.url, YOUTUBE_REDIRECT_URI);
      const code = urlObj.searchParams.get('code');
      const error = urlObj.searchParams.get('error');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h2 style="font-family:sans-serif;text-align:center;margin-top:80px">✅ Autenticado! Pode fechar esta aba.</h2>');
      if (error || !code) {
        if (!isResolved) { isResolved = true; cleanup(); reject(`Erro na autenticação do YouTube: ${error || 'código não recebido'}`); }
        return;
      }
      if (!isResolved) {
        isResolved = true; cleanup();
        fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ code, client_id: YOUTUBE_CLIENT_ID, client_secret: YOUTUBE_CLIENT_SECRET, redirect_uri: YOUTUBE_REDIRECT_URI, grant_type: 'authorization_code' }).toString(),
        }).then(r => r.json()).then(data => {
          if (data.access_token) resolve(data.access_token);
          else reject('Token não recebido: ' + JSON.stringify(data));
        }).catch(err => reject('Falha ao trocar código por token: ' + err.message));
      }
    });
    server.listen(8080, '127.0.0.1', () => {
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${YOUTUBE_CLIENT_ID}&redirect_uri=${encodeURIComponent(YOUTUBE_REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent('https://www.googleapis.com/auth/youtube.readonly')}&access_type=offline&prompt=consent`;
      authWindow = new BrowserWindow({ width: 520, height: 720, show: true, webPreferences: { nodeIntegration: false, contextIsolation: true } });
      authWindow.loadURL(authUrl);
      authWindow.on('closed', () => { if (!isResolved) { isResolved = true; cleanup(); reject('O usuário fechou a janela de login do YouTube.'); } });
    });
    server.on('error', (err) => { if (!isResolved) { isResolved = true; reject('Falha ao iniciar servidor local OAuth: ' + err.message); } });
  });
});

// ─── IPC: Selecionar Imagem ──────────────────────────────────────────────────
ipcMain.handle('select-image-file', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Selecionar Banner de Fundo', properties: ['openFile'],
    filters: [{ name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }]
  });
  return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0];
});

// ─── IPC: Ler Pasta Local ────────────────────────────────────────────────────
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  if (result.canceled || result.filePaths.length === 0) return [];
  const folderPath = result.filePaths[0];
  const files = fs.readdirSync(folderPath);
  const videoExts = ['.mp4', '.mkv', '.avi', '.webm', '.mov'];
  return files.filter(f => videoExts.includes(path.extname(f).toLowerCase())).map(file => ({
    name: file,
    path: `file:///${path.join(folderPath, file).replace(/\\/g, '/')}`,
  }));
});

// ─── Persistência Local (JSON) ──────────────────────────────────────────────
const getDataFilePath = () => path.join(app.getPath('userData'), 'streamtv-data.json');

ipcMain.handle('save-data', async (_event, data) => {
  try {
    fs.writeFileSync(getDataFilePath(), JSON.stringify(data, null, 2), 'utf-8');
    return { success: true };
  } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('load-data', async () => {
  try {
    const filePath = getDataFilePath();
    if (!fs.existsSync(filePath)) return { success: true, data: null };
    return { success: true, data: JSON.parse(fs.readFileSync(filePath, 'utf-8')) };
  } catch (err) { return { success: false, error: err.message }; }
});

// ═══════════════════════════════════════════════════════════════════════════
// TTS (Text-to-Speech) para transmissão ao vivo via arquivo + HTTP
// ═══════════════════════════════════════════════════════════════════════════

const ttsDir = path.join(app.getPath('userData'), 'tts_cache');
if (!fs.existsSync(ttsDir)) fs.mkdirSync(ttsDir, { recursive: true });

let ttsSequence = 0;
let ttsServer = null;
const TTS_HTTP_PORT = 15001;

/**
 * Inicia um servidor HTTP simples que serve o último arquivo TTS gerado
 * O FFmpeg principal faz requisições HTTP para este servidor
 */
const startTtsHttpServer = () => {
  if (ttsServer) return;
  
  const http = require('http');
  let currentTtsFile = null;
  let currentTtsData = null;
  
  // Gera silêncio em WAV para quando não há TTS ativo
  const generateSilenceWav = () => {
    // WAV header + 0.5 segundos de silêncio (44100Hz, 16 bits, mono)
    const sampleRate = 44100;
    const duration = 0.5;
    const numSamples = Math.floor(sampleRate * duration);
    const dataSize = numSamples * 2; // 16 bits = 2 bytes por sample
    
    const buffer = Buffer.alloc(44 + dataSize);
    // RIFF header
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write('WAVE', 8);
    // fmt chunk
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16); // chunk size
    buffer.writeUInt16LE(1, 20);  // PCM
    buffer.writeUInt16LE(1, 22);  // mono
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * 2, 28); // byte rate
    buffer.writeUInt16LE(2, 32);  // block align
    buffer.writeUInt16LE(16, 34); // bits per sample
    // data chunk
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);
    // data is already zero-filled (silence)
    
    return buffer;
  };
  
  ttsServer = http.createServer((req, res) => {
    res.writeHead(200, {
      'Content-Type': 'audio/wav',
      'Content-Length': currentTtsData ? currentTtsData.length : generateSilenceWav().length,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Connection': 'close'
    });
    
    if (currentTtsData) {
      res.end(currentTtsData);
      // Limpa após servir para que a próxima requisição pegue silêncio
      currentTtsData = null;
      currentTtsFile = null;
    } else {
      res.end(generateSilenceWav());
    }
  });
  
  ttsServer.listen(TTS_HTTP_PORT, '127.0.0.1', () => {
    console.log(`[TTS] Servidor HTTP rodando na porta ${TTS_HTTP_PORT}`);
  });
  
  // Expõe função para atualizar o arquivo TTS atual
  return (filePath) => {
    try {
      currentTtsData = fs.readFileSync(filePath);
      currentTtsFile = filePath;
      console.log(`[TTS] Áudio pronto no servidor HTTP: ${filePath} (${currentTtsData.length} bytes)`);
    } catch (err) {
      console.error('[TTS] Erro ao ler arquivo para servidor HTTP:', err);
    }
  };
};

let updateTtsFile = null; // Função para atualizar o áudio TTS no servidor

// Gera um arquivo WAV com a voz usando PowerShell SAPI no Windows
const generateTtsWav = (text, outputPath) => {
  return new Promise((resolve, reject) => {
    const escapedText = text.replace(/\\/g, '\\\\').replace(/'/g, "''").replace(/"/g, '\\"');
    const psScript = `
$text = '${escapedText}'
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $synth.SelectVoice("Microsoft Maria Desktop")
} catch {
  try { $synth.SelectVoice("Microsoft Zira Desktop") } catch {}
}
$synth.Rate = 0
$synth.Volume = 100
$synth.SetOutputToWaveFile('${outputPath.replace(/\\/g, '\\\\')}')
$synth.Speak($text)
$synth.Dispose()
`;
    const psFile = path.join(ttsDir, `tts_script_${Date.now()}.ps1`);
    fs.writeFileSync(psFile, psScript, 'utf-8');
    try {
      execSync(`powershell -ExecutionPolicy Bypass -File "${psFile}"`, { timeout: 30000, windowsHide: true });
      try { fs.unlinkSync(psFile); } catch {}
      resolve(outputPath);
    } catch (err) {
      try { fs.unlinkSync(psFile); } catch {}
      reject(err);
    }
  });
};

// IPC: Gerar TTS e misturar no stream
ipcMain.handle('speak-tts', async (_event, { text }) => {
  if (!text || !text.trim()) return { success: false, error: 'Texto vazio' };
  try {
    const ttsFile = path.join(ttsDir, `tts_${Date.now()}_${ttsSequence++}.wav`);
    console.log(`[TTS] Gerando áudio: "${text.substring(0, 50)}..."`);
    await generateTtsWav(text, ttsFile);
    
    // Atualiza o servidor HTTP com o novo arquivo TTS
    if (updateTtsFile) {
      updateTtsFile(ttsFile);
      console.log(`[TTS] Áudio disponível via HTTP para o FFmpeg`);
    }
    
    // Limpa o arquivo após 30 segundos
    setTimeout(() => { 
      try { 
        if (fs.existsSync(ttsFile)) fs.unlinkSync(ttsFile); 
      } catch {} 
    }, 30000);
    
    return { success: true, file: ttsFile };
  } catch (err) {
    console.error('[TTS] Erro ao gerar áudio:', err);
    return { success: false, error: String(err) };
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// RTMP Streaming via FFmpeg
// ═══════════════════════════════════════════════════════════════════════════

let ffmpegProcess = null;
let streamStatus = 'idle';
let currentRtmpUrl = '';
let currentOverlayConfig = null;

const getFfmpegPath = () => {
  if (isDev) {
    try { return require('ffmpeg-static'); } catch { return 'ffmpeg'; }
  }
  const unpackedPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'ffmpeg-static', 'ffmpeg.exe');
  if (fs.existsSync(unpackedPath)) return unpackedPath;
  try {
    let ffmpegPath = require('ffmpeg-static');
    if (ffmpegPath && ffmpegPath.includes('app.asar')) ffmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked');
    return ffmpegPath;
  } catch { return 'ffmpeg'; }
};

const resolveFilePath = (videoPath) => {
  if (!videoPath) return null;
  let filePath = videoPath;
  if (filePath.startsWith('file:///')) {
    filePath = filePath.replace('file:///', '');
    if (process.platform === 'win32') filePath = filePath.replace(/\//g, '\\');
  }
  return filePath;
};

const killFfmpeg = () => {
  return new Promise((resolve) => {
    if (!ffmpegProcess) return resolve();
    const proc = ffmpegProcess;
    ffmpegProcess = null;
    try { proc.stdin.write('q'); } catch {}
    setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch {}
      resolve();
    }, 1000);
  });
};

// ─── yt-dlp ──────────────────────────────────────────────────────────────────
const getYtDlpPath = () => {
  const possiblePaths = ['yt-dlp', path.join(app.getPath('userData'), 'yt-dlp.exe'), path.join(process.cwd(), 'yt-dlp.exe')];
  for (const p of possiblePaths) {
    try { execSync(`"${p}" --version`, { windowsHide: true, timeout: 5000 }); return p; } catch {}
  }
  return null;
};

const resolveYouTubeUrl = (youtubeUrl) => {
  return new Promise((resolve, reject) => {
    const ytdlp = getYtDlpPath();
    if (!ytdlp) return reject('yt-dlp não encontrado.');
    console.log(`[yt-dlp] Resolvendo URL: ${youtubeUrl}`);
    const proc = spawn(ytdlp, ['--get-url', '-f', 'best[height<=1080]', '--no-playlist', youtubeUrl], { windowsHide: true });
    let stdout = '', stderr = '';
    proc.stdout.on('data', d => stdout += d.toString());
    proc.stderr.on('data', d => stderr += d.toString());
    proc.on('close', (code) => {
      if (code === 0 && stdout.trim()) {
        const url = stdout.trim().split('\n')[0];
        console.log(`[yt-dlp] URL resolvida: ${url.substring(0, 80)}...`);
        resolve(url);
      } else {
        reject(`yt-dlp falhou (código ${code}): ${stderr || 'URL não encontrada'}`);
      }
    });
    proc.on('error', (err) => reject(`yt-dlp erro: ${err.message}`));
  });
};

ipcMain.handle('resolve-youtube-url', async (_event, { url }) => {
  try { const directUrl = await resolveYouTubeUrl(url); return { success: true, url: directUrl }; }
  catch (err) { return { success: false, error: String(err) }; }
});

// ─── Filtros de overlay (drawtext) ──────────────────────────────────────────
const buildOverlayFilter = (overlayConfig, programTitle) => {
  if (!overlayConfig || !overlayConfig.enabled) return null;
  const layers = (overlayConfig.layers || []).filter(l => l.enabled);
  if (layers.length === 0) return null;
  const esc = (t) => (t || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/:/g, '\\:');
  const ffCol = (hex) => `0x${(hex || '#ffffff').replace('#', '')}@1.0`;
  const filters = [];
  for (const layer of layers) {
    const fs = layer.fontSize || 28;
    const color = ffCol(layer.color);
    const pxY = Math.round(((layer.y || 0) / 100) * 1080);
    if (layer.bgEnabled && layer.bgFullWidth) {
      const barH = fs + 20;
      const barY = Math.max(0, pxY - 8);
      filters.push(`drawbox=x=0:y=${barY}:w=iw:h=${barH}:color=black@0.7:t=fill`);
    }
    if (layer.type === 'text') {
      const pxX = Math.round(((layer.x || 0) / 100) * 1920);
      let f = `drawtext=text='${esc(layer.text || '')}':fontsize=${fs}:fontcolor=${color}:x=${pxX}:y=${pxY}`;
      if (layer.bgEnabled && !layer.bgFullWidth) f += ':box=1:boxcolor=black@0.5:boxborderw=6';
      filters.push(f);
    } else if (layer.type === 'clock') {
      const pxX = Math.round(((layer.x || 0) / 100) * 1920);
      let f = `drawtext=text='%{localtime\\:%H\\\\\\:%M\\\\\\:%S}':fontsize=${fs}:fontcolor=${color}:x=${pxX}:y=${pxY}`;
      if (layer.bgEnabled && !layer.bgFullWidth) f += ':box=1:boxcolor=black@0.5:boxborderw=5';
      filters.push(f);
    } else if (layer.type === 'ticker') {
      const speed = layer.scrollSpeed || 150;
      const xExpr = layer.scrollDir === 'right' ? `mod(t*${speed}\\,w+tw)-tw` : `w-mod(t*${speed}\\,w+tw)`;
      let f = `drawtext=text='${esc(layer.text || '')}':fontsize=${fs}:fontcolor=${color}:x=${xExpr}:y=${pxY}`;
      if (layer.bgEnabled && !layer.bgFullWidth) f += ':box=1:boxcolor=black@0.5:boxborderw=5';
      filters.push(f);
    }
  }
  return filters.length > 0 ? filters.join(',') : null;
};

const TTS_HTTP_URL = `http://127.0.0.1:${TTS_HTTP_PORT}/tts.wav`;

// ─── Build args: YouTube Live ────────────────────────────────────────────────
const buildYouTubeLiveArgs = (streamUrl, fullRtmpUrl, vfFilter, hwAccel = false) => {
  return [
    '-nostdin', '-y',
    '-reconnect', '1', '-reconnect_at_eof', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5',
    '-i', streamUrl,
    // HTTP stream para receber áudio TTS
    '-f', 'wav',
    '-re',
    '-i', TTS_HTTP_URL,
    ...(vfFilter ? ['-vf', vfFilter] : []),
    '-filter_complex', '[0:a][1:a]amix=inputs=2:duration=first:weights=1 0.5,volume=2.0[aout]',
    '-map', '0:v', '-map', '[aout]',
    '-c:v', hwAccel ? 'h264_nvenc' : 'libx264', '-preset', hwAccel ? 'fast' : 'veryfast',
    '-pix_fmt', 'yuv420p', '-g', '60', '-profile:v', 'main',
    '-maxrate', '3000k', '-bufsize', '6000k',
    '-c:a', 'aac', '-b:a', '128k', '-ar', '44100',
    '-f', 'flv', '-flvflags', 'no_duration_filesize',
    fullRtmpUrl
  ];
};

// ─── Build args: Video File ─────────────────────────────────────────────────
const buildVideoArgs = (filePath, offsetSeconds, fullRtmpUrl, vfFilter, hwAccel = false) => {
  const args = [
    '-nostdin', '-y',
    '-ss', String(Math.floor(offsetSeconds)), '-re',
    '-i', filePath,
    '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
    // HTTP stream para receber áudio TTS
    '-f', 'wav',
    '-re',
    '-i', TTS_HTTP_URL,
  ];
  const vfPart = vfFilter ? `;[0:v]${vfFilter}[vout]` : '';
  args.push(
    '-filter_complex', `[0:a][1:a]amix=inputs=2:duration=first:weights=1 0[base];[base][2:a]amix=inputs=2:duration=first:weights=1 0.8,volume=1.5[aout]${vfPart}`,
    '-map', vfFilter ? '[vout]' : '0:v',
    '-map', '[aout]',
    '-c:v', hwAccel ? 'h264_nvenc' : 'libx264', '-preset', hwAccel ? 'fast' : 'veryfast',
    '-pix_fmt', 'yuv420p', '-g', '60', '-profile:v', 'main',
    '-maxrate', '3000k', '-bufsize', '6000k',
    '-c:a', 'aac', '-b:a', '128k', '-ar', '44100',
    '-f', 'flv', '-flvflags', 'no_duration_filesize',
    fullRtmpUrl
  );
  return args;
};

// ─── Build args: Radio ──────────────────────────────────────────────────────
const buildRadioArgs = (radioUrl, bannerUrl, fullRtmpUrl, vfFilter, hwAccel = false) => {
  const resolvedBanner = resolveFilePath(bannerUrl);
  console.log(`[FFmpeg] Radio | url=${radioUrl} | banner=${resolvedBanner}`);
  const hasBannerFile = resolvedBanner && !resolvedBanner.startsWith('http') && fs.existsSync(resolvedBanner);
  const hasBannerUrl = resolvedBanner && resolvedBanner.startsWith('http');
  const args = ['-nostdin', '-y'];
  args.push('-f', 'lavfi', '-i', 'color=c=black:s=1920x1080:r=25');
  args.push('-reconnect', '1', '-reconnect_at_eof', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5', '-user_agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0', '-i', radioUrl);
  // HTTP stream para receber áudio TTS
  args.push('-f', 'wav', '-re', '-i', TTS_HTTP_URL);

  let filterComplex = null;
  let mapVideo = '0:v';
  let extraVf = null;
  const audioFilter = '[1:a][2:a]amix=inputs=2:duration=first:weights=1 0.8,volume=2.0[aout]';

  if (hasBannerFile || hasBannerUrl) {
    args.push('-f', 'image2', '-loop', '1', '-r', '1', '-i', resolvedBanner);
    const scaleFilter = '[3:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080[scaled];[0:v][scaled]overlay=0:0';
    filterComplex = vfFilter ? `${scaleFilter}[bg];[bg]${vfFilter}[vout]` : `${scaleFilter}[vout]`;
    mapVideo = '[vout]';
  } else {
    extraVf = vfFilter || null;
  }

  if (filterComplex) {
    args.push('-filter_complex', `${filterComplex};${audioFilter}`, '-map', mapVideo);
  } else {
    args.push('-filter_complex', audioFilter, '-map', '0:v');
  }
  if (extraVf) args.push('-vf', extraVf);
  args.push('-map', '[aout]',
    '-c:v', hwAccel ? 'h264_nvenc' : 'libx264', '-preset', hwAccel ? 'fast' : 'veryfast',
    ...(hwAccel ? [] : ['-tune', 'stillimage']),
    '-pix_fmt', 'yuv420p', '-g', '50', '-profile:v', 'main',
    '-maxrate', '3000k', '-bufsize', '6000k',
    '-c:a', 'aac', '-b:a', '128k', '-ar', '44100',
    '-f', 'flv', '-flvflags', 'no_duration_filesize',
    fullRtmpUrl
  );
  return args;
};

// ─── Build args: Screensaver ────────────────────────────────────────────────
const buildScreensaverArgs = (fullRtmpUrl, vfFilter, hwAccel = false) => {
  const args = [
    '-nostdin', '-y', '-re',
    '-f', 'lavfi', '-i', 'color=c=#1a1a2e:s=1920x1080:r=30,drawtext=text=StreamTV:fontsize=80:fontcolor=white@0.6:x=(w-text_w)/2:y=(h-text_h)/2',
    '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
    // HTTP stream para receber áudio TTS
    '-f', 'wav', '-re', '-i', TTS_HTTP_URL,
    '-filter_complex', '[1:a][2:a]amix=inputs=2:duration=first:weights=1 0.8,volume=2.0[aout]',
    '-map', '0:v', '-map', '[aout]',
    '-c:v', hwAccel ? 'h264_nvenc' : 'libx264', '-preset', hwAccel ? 'fast' : 'veryfast',
    '-maxrate', '2000k', '-bufsize', '4000k',
    '-pix_fmt', 'yuv420p', '-g', '60',
    '-c:a', 'aac', '-b:a', '128k',
    '-t', '86400',
    '-f', 'flv',
    fullRtmpUrl
  ];
  return args;
};

// ─── Spawn FFmpeg ────────────────────────────────────────────────────────────
const spawnFfmpeg = (args) => {
  const ffmpegPath = getFfmpegPath();
  const fullCommand = `"${ffmpegPath}" ${args.join(' ')}`;
  console.log(`[FFmpeg] Executando: ${fullCommand}`);
  BrowserWindow.getAllWindows().forEach(w => w.webContents.send('stream-log', `[SISTEMA] Iniciando FFmpeg...\n`));
  ffmpegProcess = spawn(ffmpegPath, args, { windowsHide: true });
  streamStatus = 'streaming';

  ffmpegProcess.stderr.on('data', (data) => {
    const msg = data.toString();
    console.log(msg);
    BrowserWindow.getAllWindows().forEach(w => w.webContents.send('stream-log', msg));
  });
  ffmpegProcess.on('error', (err) => {
    console.error('[FFmpeg] Erro fatal:', err);
    streamStatus = 'error';
    BrowserWindow.getAllWindows().forEach(w => w.webContents.send('stream-status', { status: 'error', message: err.message }));
  });
  ffmpegProcess.on('close', (code) => {
    console.log(`[FFmpeg] Finalizado com código ${code}`);
    if (ffmpegProcess !== null) {
      streamStatus = 'idle'; ffmpegProcess = null;
      const msg = code !== 0 ? `Erro ${code}: Falha na transmissão.` : 'Transmissão encerrada.';
      BrowserWindow.getAllWindows().forEach(w => w.webContents.send('stream-status', { status: 'idle', message: msg }));
    } else { streamStatus = 'idle'; }
  });
};

// ─── IPC: Start Stream ──────────────────────────────────────────────────────
ipcMain.handle('start-stream', async (_event, { videoPath, offsetSeconds, rtmpUrl, streamKey, mode, overlayConfig, programTitle, fallbackUrl, fallbackBanner, hwAccel }) => {
  if (ffmpegProcess) return { success: false, error: 'Já existe uma transmissão ativa.' };
  const fullRtmpUrl = `${rtmpUrl}/${streamKey}`;
  currentRtmpUrl = fullRtmpUrl;
  currentOverlayConfig = overlayConfig;
  const vfFilter = buildOverlayFilter(overlayConfig, programTitle);
  let args;
  const isWebRadio = videoPath === '__webradio__' || mode === 'radio';
  if (isWebRadio || (!videoPath && fallbackUrl)) {
    const radioSource = (videoPath === '__webradio__' && fallbackUrl) ? fallbackUrl : (fallbackUrl || videoPath);
    args = buildRadioArgs(radioSource, fallbackBanner, fullRtmpUrl, vfFilter, hwAccel);
  } else if (videoPath && videoPath.startsWith('__ytlive__:')) {
    const ytStreamUrl = videoPath.replace('__ytlive__:', '');
    args = buildYouTubeLiveArgs(ytStreamUrl, fullRtmpUrl, vfFilter, hwAccel);
  } else if (videoPath === '__camera__' || mode === 'screensaver' || !videoPath) {
    args = buildScreensaverArgs(fullRtmpUrl, vfFilter, hwAccel);
  } else {
    args = buildVideoArgs(resolveFilePath(videoPath), offsetSeconds, fullRtmpUrl, vfFilter, hwAccel);
  }
  spawnFfmpeg(args);
  return { success: true };
});

// ─── IPC: Switch Stream ─────────────────────────────────────────────────────
ipcMain.handle('switch-stream', async (_event, { videoPath, offsetSeconds, overlayConfig, programTitle, fallbackUrl, fallbackBanner, mode, hwAccel }) => {
  if (!currentRtmpUrl) return { success: false, error: 'Nenhuma transmissão ativa.' };
  await killFfmpeg();
  await new Promise(r => setTimeout(r, 1000));
  const vfFilter = buildOverlayFilter(overlayConfig || currentOverlayConfig, programTitle);
  let args;
  const isWebRadio = videoPath === '__webradio__' || mode === 'radio';
  if (isWebRadio || (!videoPath && fallbackUrl)) {
    const radioSource = (videoPath === '__webradio__' && fallbackUrl) ? fallbackUrl : (fallbackUrl || videoPath);
    args = buildRadioArgs(radioSource, fallbackBanner, currentRtmpUrl, vfFilter, hwAccel);
  } else if (videoPath && videoPath.startsWith('__ytlive__:')) {
    const ytStreamUrl = videoPath.replace('__ytlive__:', '');
    args = buildYouTubeLiveArgs(ytStreamUrl, currentRtmpUrl, vfFilter, hwAccel);
  } else if (videoPath === '__camera__' || !videoPath) {
    args = buildScreensaverArgs(currentRtmpUrl, vfFilter, hwAccel);
  } else {
    args = buildVideoArgs(resolveFilePath(videoPath), offsetSeconds, currentRtmpUrl, vfFilter, hwAccel);
  }
  spawnFfmpeg(args);
  return { success: true };
});

// ─── IPC: Stop Stream ───────────────────────────────────────────────────────
ipcMain.handle('stop-stream', async () => {
  if (ffmpegProcess) {
    await killFfmpeg();
    streamStatus = 'idle';
    currentRtmpUrl = '';
    return { success: true };
  }
  return { success: false };
});

ipcMain.handle('get-stream-status', async () => ({ status: streamStatus }));

// ─── App Lifecycle ─────────────────────────────────────────────────────────
app.whenReady().then(() => {
  // Inicia o servidor HTTP TTS para o Virtual Announcer
  updateTtsFile = startTtsHttpServer();
  createWindow();
});
app.on('window-all-closed', () => {
  if (ffmpegProcess) ffmpegProcess.kill();
  if (ttsServer) ttsServer.close();
  if (process.platform !== 'darwin') app.quit();
});
