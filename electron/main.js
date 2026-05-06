import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { dialog } from 'electron';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import { spawn } from 'child_process';

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
      contextIsolation: false, // Permitir require no React para IPC
      webSecurity: false, // Necessário para exibir vídeos do diretório local via file:///
    },
    autoHideMenuBar: true,
    backgroundColor: '#121212',
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

// IPC para receber Client IDs e secrets da interface
ipcMain.handle('save-client-ids', async (_event, { twitchId, youtubeId, youtubeSecret }) => {
  if (twitchId !== undefined) TWITCH_CLIENT_ID = twitchId;
  if (youtubeId !== undefined) YOUTUBE_CLIENT_ID = youtubeId;
  if (youtubeSecret !== undefined) YOUTUBE_CLIENT_SECRET = youtubeSecret;
  return true;
});

// IPC para Fluxo OAuth da Twitch
ipcMain.handle('login-twitch', async () => {
  if (!TWITCH_CLIENT_ID) {
    throw new Error('Client ID da Twitch não configurado. Preencha nas Configurações.');
  }
  return new Promise((resolve, reject) => {
    const authWindow = new BrowserWindow({
      width: 500,
      height: 700,
      show: true,
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
      if (checkUrl(newUrl)) {
        event.preventDefault();
      }
    });

    authWindow.webContents.on('did-navigate', (event, newUrl) => {
      checkUrl(newUrl);
    });

    authWindow.on('closed', () => {
      if (!isResolved) {
        reject('O usuário fechou a janela de login.');
      }
    });
  });
});

// IPC para Fluxo OAuth do YouTube (Authorization Code Flow via servidor local)
ipcMain.handle('login-youtube', async () => {
  if (!YOUTUBE_CLIENT_ID) {
    throw new Error('Client ID do YouTube não configurado. Preencha nas Configurações.');
  }

  const http = (await import('http')).default;
  const YOUTUBE_REDIRECT_URI = 'http://localhost:8080';

  return new Promise((resolve, reject) => {
    let server = null;
    let authWindow = null; // declarado aqui para ser visível em todos os callbacks
    let isResolved = false;

    const cleanup = () => {
      try { server && server.close(); } catch {}
      try { authWindow && !authWindow.isDestroyed() && authWindow.close(); } catch {}
    };

    // Servidor temporário para capturar o código de autorização
    server = http.createServer((req, res) => {
      const urlObj = new URL(req.url, YOUTUBE_REDIRECT_URI);
      const code = urlObj.searchParams.get('code');
      const error = urlObj.searchParams.get('error');

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h2 style="font-family:sans-serif;text-align:center;margin-top:80px">✅ Autenticado! Pode fechar esta aba.</h2>');

      if (error || !code) {
        if (!isResolved) {
          isResolved = true;
          cleanup();
          reject(`Erro na autenticação do YouTube: ${error || 'código não recebido'}`);
        }
        return;
      }

      if (!isResolved) {
        isResolved = true;
        cleanup();
        // Troca o authorization code por um access_token
        fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            client_id: YOUTUBE_CLIENT_ID,
            client_secret: YOUTUBE_CLIENT_SECRET,
            redirect_uri: YOUTUBE_REDIRECT_URI,
            grant_type: 'authorization_code',
          }).toString(),
        })
          .then(r => r.json())
          .then(data => {
            if (data.access_token) {
              resolve(data.access_token);
            } else {
              reject('Token não recebido: ' + JSON.stringify(data));
            }
          })
          .catch(err => reject('Falha ao trocar código por token: ' + err.message));
      }
    });

    server.listen(8080, '127.0.0.1', () => {
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${YOUTUBE_CLIENT_ID}` +
        `&redirect_uri=${encodeURIComponent(YOUTUBE_REDIRECT_URI)}` +
        `&response_type=code` +
        `&scope=${encodeURIComponent('https://www.googleapis.com/auth/youtube.readonly')}` +
        `&access_type=offline` +
        `&prompt=consent`;

      // atribui à variável do escopo externo
      authWindow = new BrowserWindow({
        width: 520,
        height: 720,
        show: true,
        webPreferences: { nodeIntegration: false, contextIsolation: true }
      });

      authWindow.loadURL(authUrl);

      authWindow.on('closed', () => {
        if (!isResolved) {
          isResolved = true;
          cleanup();
          reject('O usuário fechou a janela de login do YouTube.');
        }
      });
    });

    server.on('error', (err) => {
      if (!isResolved) {
        isResolved = true;
        reject('Falha ao iniciar servidor local OAuth: ' + err.message);
      }
    });
  });
});

// IPC para Selecionar Imagem (Banner)
ipcMain.handle('select-image-file', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Selecionar Banner de Fundo',
    properties: ['openFile'],
    filters: [
      { name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0]; // Caminho completo do arquivo
});

// IPC para Ler Pasta Local
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });

  if (result.canceled || result.filePaths.length === 0) {
    return [];
  }

  const folderPath = result.filePaths[0];
  const files = fs.readdirSync(folderPath);
  
  // Filtra apenas arquivos de vídeo comuns
  const videoExts = ['.mp4', '.mkv', '.avi', '.webm', '.mov'];
  const videoFiles = files.filter(f => videoExts.includes(path.extname(f).toLowerCase()));

  return videoFiles.map(file => {
    return {
      name: file,
      path: `file:///${path.join(folderPath, file).replace(/\\/g, '/')}`,
    };
  });
});

// ==========================================
// Persistência Local (JSON)
// ==========================================
const getDataFilePath = () => {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'streamtv-data.json');
};

ipcMain.handle('save-data', async (_event, data) => {
  try {
    const filePath = getDataFilePath();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return { success: true, path: filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('load-data', async () => {
  try {
    const filePath = getDataFilePath();
    if (!fs.existsSync(filePath)) {
      return { success: true, data: null }; // Primeira execução
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    return { success: true, data: JSON.parse(raw) };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ==========================================
// RTMP Streaming via FFmpeg
// ==========================================

let ffmpegProcess = null;
let streamStatus = 'idle'; // idle | streaming | error
let currentRtmpUrl = '';
let currentOverlayConfig = null;

const getFfmpegPath = () => {
  if (isDev) {
    try {
      return require('ffmpeg-static');
    } catch {
      return 'ffmpeg';
    }
  }
  
  const unpackedPath = path.join(
    process.resourcesPath,
    'app.asar.unpacked',
    'node_modules',
    'ffmpeg-static',
    'ffmpeg.exe'
  );
  
  if (fs.existsSync(unpackedPath)) {
    return unpackedPath;
  }
  
  try {
    let ffmpegPath = require('ffmpeg-static');
    if (ffmpegPath && ffmpegPath.includes('app.asar')) {
      ffmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked');
    }
    return ffmpegPath;
  } catch {
    return 'ffmpeg';
  }
};

const resolveFilePath = (videoPath) => {
  if (!videoPath) return null;
  let filePath = videoPath;
  if (filePath.startsWith('file:///')) {
    filePath = filePath.replace('file:///', '');
    if (process.platform === 'win32') {
      filePath = filePath.replace(/\//g, '\\');
    }
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

// ==========================================
// yt-dlp: Extrair URL direta de lives/vídeos do YouTube
// ==========================================
const getYtDlpPath = () => {
  // Tenta encontrar yt-dlp no PATH do sistema
  const possiblePaths = [
    'yt-dlp',
    path.join(app.getPath('userData'), 'yt-dlp.exe'),
    path.join(process.cwd(), 'yt-dlp.exe'),
  ];
  for (const p of possiblePaths) {
    try {
      const { execSync } = require('child_process');
      execSync(`"${p}" --version`, { windowsHide: true, timeout: 5000 });
      return p;
    } catch {}
  }
  return null;
};

const resolveYouTubeUrl = (youtubeUrl) => {
  return new Promise((resolve, reject) => {
    const ytdlp = getYtDlpPath();
    if (!ytdlp) {
      return reject('yt-dlp não encontrado. Instale via: winget install yt-dlp ou baixe em https://github.com/yt-dlp/yt-dlp/releases');
    }
    
    console.log(`[yt-dlp] Resolvendo URL: ${youtubeUrl}`);
    const proc = spawn(ytdlp, [
      '--get-url',
      '-f', 'best[height<=1080]',
      '--no-playlist',
      youtubeUrl
    ], { windowsHide: true });

    let stdout = '';
    let stderr = '';
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
  try {
    const directUrl = await resolveYouTubeUrl(url);
    return { success: true, url: directUrl };
  } catch (err) {
    return { success: false, error: String(err) };
  }
});

const buildYouTubeLiveArgs = (streamUrl, fullRtmpUrl, vfFilter, hwAccel = false) => {
  const args = [
    '-nostdin', '-y',
    '-reconnect', '1',
    '-reconnect_at_eof', '1',
    '-reconnect_streamed', '1',
    '-reconnect_delay_max', '5',
    '-i', streamUrl,
  ];

  if (vfFilter) {
    args.push('-vf', vfFilter);
  }

  args.push(
    '-af', 'dynaudnorm=f=150:g=15',
    '-c:v', hwAccel ? 'h264_nvenc' : 'libx264', '-preset', hwAccel ? 'fast' : 'veryfast',
    '-pix_fmt', 'yuv420p', '-g', '60', '-profile:v', 'main',
    '-maxrate', '3000k', '-bufsize', '6000k',
    '-c:a', 'aac', '-b:a', '128k', '-ar', '44100',
    '-f', 'flv', '-flvflags', 'no_duration_filesize',
    fullRtmpUrl
  );
  return args;
};

const buildOverlayFilter = (overlayConfig, programTitle) => {
  if (!overlayConfig || !overlayConfig.enabled) return null;
  const layers = (overlayConfig.layers || []).filter(l => l.enabled);
  if (layers.length === 0) return null;

  const esc  = (t) => (t || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/:/g, '\\:');
  const ffCol = (hex) => `0x${(hex || '#ffffff').replace('#', '')}@1.0`;

  const filters = [];

  for (const layer of layers) {
    const fs    = layer.fontSize || 28;
    const color = ffCol(layer.color);
    const pxY   = Math.round(((layer.y || 0) / 100) * 1080);

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

const buildVideoArgs = (filePath, offsetSeconds, fullRtmpUrl, vfFilter, hwAccel = false) => {
  const args = [
    '-nostdin', '-y',
    '-ss', String(Math.floor(offsetSeconds)),
    '-re',
    '-i', filePath,
    '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
    // Normalização de Áudio Profissional (dynaudnorm) injetada no final do mix
    '-filter_complex', `[0:a][1:a]amix=inputs=2:duration=first,dynaudnorm=f=150:g=15[aout]${vfFilter ? `;[0:v]${vfFilter}[vout]` : ''}`,
    '-map', vfFilter ? '[vout]' : '0:v',
    '-map', '[aout]',
    '-c:v', hwAccel ? 'h264_nvenc' : 'libx264', '-preset', hwAccel ? 'fast' : 'veryfast',
    '-pix_fmt', 'yuv420p', '-g', '60', '-profile:v', 'main',
    '-maxrate', '3000k', '-bufsize', '6000k',
    '-c:a', 'aac', '-b:a', '128k', '-ar', '44100',
    '-f', 'flv', '-flvflags', 'no_duration_filesize',
    fullRtmpUrl
  ];
  return args;
};

const buildRadioArgs = (radioUrl, bannerUrl, fullRtmpUrl, vfFilter, hwAccel = false) => {
  const resolvedBanner = resolveFilePath(bannerUrl);
  console.log(`[FFmpeg] Building Radio Args | radioUrl=${radioUrl} | banner=${resolvedBanner}`);

  const hasBannerFile = resolvedBanner &&
    !resolvedBanner.startsWith('http') &&
    fs.existsSync(resolvedBanner);
  const hasBannerUrl = resolvedBanner && resolvedBanner.startsWith('http');

  const args = ['-nostdin', '-y'];

  // Input 0: SEMPRE usa lavfi como base de vídeo (é infinito, sem flags de loop)
  // O banner será sobreposto via filter_complex se disponível
  args.push('-f', 'lavfi', '-i', 'color=c=black:s=1920x1080:r=25');

  // Input 1: Áudio da rádio online
  args.push(
    '-reconnect', '1',
    '-reconnect_at_eof', '1',
    '-reconnect_streamed', '1',
    '-reconnect_delay_max', '5',
    '-user_agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
    '-i', radioUrl
  );

  // Constrói o filter_complex: banner overlay + vfFilter (texto, ticker, etc.)
  // REGRA FFmpeg: não pode usar -filter_complex e -vf ao mesmo tempo no mesmo output.
  // Quando há banner, o vfFilter de texto é ENCADEADO dentro do filter_complex.
  // Quando não há banner, o vfFilter é passado via -vf normalmente.
  let filterComplex = null;
  let mapVideo = '0:v';
  let extraVf = null;

  if (hasBannerFile || hasBannerUrl) {
    if (hasBannerFile) {
      args.push('-f', 'image2', '-loop', '1', '-r', '1', '-i', resolvedBanner);
    } else {
      args.push('-f', 'image2', '-loop', '1', '-r', '1', '-i', resolvedBanner);
    }

    // Escala o banner para preencher exatos 1920x1080, cortando o excesso se a proporção não for 16:9
    const scaleFilter = '[2:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080[scaled];[0:v][scaled]overlay=0:0';
    
    if (vfFilter) {
      filterComplex = `${scaleFilter}[bg];[bg]${vfFilter}[vout]`;
    } else {
      filterComplex = `${scaleFilter}[vout]`;
    }
    mapVideo = '[vout]';
    extraVf = null;
  } else {
    // Sem banner: fundo preto puro, vfFilter via -vf é seguro
    mapVideo = '0:v';
    extraVf = vfFilter || null;
  }

  if (filterComplex) {
    args.push('-filter_complex', filterComplex, '-map', mapVideo);
  } else {
    args.push('-map', mapVideo);
  }

  // Aplica filtros de texto via -vf SOMENTE quando não há filter_complex (sem banner)
  if (extraVf) {
    args.push('-vf', extraVf);
  }

  args.push(
    '-map', '1:a',
    '-af', 'dynaudnorm=f=150:g=15',
    '-c:v', hwAccel ? 'h264_nvenc' : 'libx264', '-preset', hwAccel ? 'fast' : 'veryfast',
    ...(hwAccel ? [] : ['-tune', 'stillimage']),
    '-pix_fmt', 'yuv420p', '-g', '50', '-profile:v', 'main',
    '-maxrate', '3000k', '-bufsize', '6000k',
    '-c:a', 'aac', '-b:a', '128k', '-ar', '44100',
    '-f', 'flv', '-flvflags', 'no_duration_filesize',
    fullRtmpUrl
  );

  console.log(`[FFmpeg] Radio command: ffmpeg ${args.join(' ')}`);
  return args;
};

const buildScreensaverArgs = (fullRtmpUrl, vfFilter, hwAccel = false) => {
  const args = [
    '-nostdin', '-y',
    '-re',
    '-f', 'lavfi', '-i', 'color=c=#1a1a2e:s=1920x1080:r=30,drawtext=text=StreamTV:fontsize=80:fontcolor=white@0.6:x=(w-text_w)/2:y=(h-text_h)/2',
    '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
    '-af', 'dynaudnorm=f=150:g=15',
    '-c:v', hwAccel ? 'h264_nvenc' : 'libx264', '-preset', hwAccel ? 'fast' : 'veryfast',
    '-maxrate', '2000k', '-bufsize', '4000k',
    '-pix_fmt', 'yuv420p', '-g', '60'
  ];
  if (vfFilter) args.push('-vf', vfFilter);
  args.push('-c:a', 'aac', '-b:a', '128k', '-t', '86400', '-f', 'flv', fullRtmpUrl);
  return args;
};

const spawnFfmpeg = (args) => {
  const ffmpegPath = getFfmpegPath();
  const fullCommand = `"${ffmpegPath}" ${args.join(' ')}`;
  console.log(`[FFmpeg] Executando: ${fullCommand}`);
  
  BrowserWindow.getAllWindows().forEach(w => w.webContents.send('stream-log', `[SISTEMA] Iniciando comando FFmpeg...\n`));
  
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
      streamStatus = 'idle';
      ffmpegProcess = null;
      const msg = code !== 0 ? `Erro ${code}: Ocorreu uma falha na transmissão.` : 'Transmissão encerrada.';
      BrowserWindow.getAllWindows().forEach(w => w.webContents.send('stream-status', { status: 'idle', message: msg }));
    } else {
      streamStatus = 'idle';
    }
  });
};

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
    // YouTube Live retransmissão — URL já resolvida pelo yt-dlp
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

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  if (ffmpegProcess) ffmpegProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});
