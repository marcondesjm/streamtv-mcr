import React, { useState, useEffect, useRef, Component, type ErrorInfo } from 'react';
import './App.css';
import { fetchTwitchVods, fetchYouTubeVideos, type VideoItem, type GospelNews } from './services/api';
import { speakTts } from './services/tts';
import MCRPro from './MCRPro';
import AutoDJ from './AutoDJ';
import VirtualAnnouncer from './VirtualAnnouncer';
import GospelNewsComponent from './GospelNews';

class ErrorBoundary extends Component<{children: React.ReactNode}, {hasError: boolean, error: Error | null}> {
  constructor(props: {children: React.ReactNode}) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', color: 'red', backgroundColor: '#333', margin: '20px', borderRadius: '8px' }}>
          <h2>Algo deu errado!</h2>
          <pre>{this.state.error?.toString()}</pre>
          <pre style={{ fontSize: '10px' }}>{this.state.error?.stack}</pre>
          <button onClick={() => this.setState({ hasError: false })}>Tentar Novamente</button>
        </div>
      );
    }
    return this.props.children;
  }
}



const CameraView: React.FC = () => {
  const vidRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    let stream: MediaStream | null = null;
    navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(s => {
      stream = s;
      if (vidRef.current) vidRef.current.srcObject = s;
    }).catch(err => console.error("Camera error:", err));
    return () => {
      if (stream) stream.getTracks().forEach(t => t.stop());
    }
  }, []);
  return <video ref={vidRef} autoPlay muted style={{ width: '100%', height: '100%', objectFit: 'contain', backgroundColor: '#000' }} />;
};

const WebRadioView: React.FC<{ radioUrl?: string; bannerUrl?: string; radioVolume?: number }> = ({ radioUrl, bannerUrl, radioVolume = 1 }) => {
  const [imgError, setImgError] = useState(false);
  
  // Converter caminho local para URL válida no Electron se necessário
  const getFullUrl = (url: string) => {
    if (!url) return '';
    if (url.startsWith('http') || url.startsWith('data:') || url.startsWith('file:')) return url;
    return `file:///${url.replace(/\\/g, '/')}`;
  };

  const finalBannerUrl = getFullUrl(bannerUrl || '');

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#050505', backgroundImage: finalBannerUrl && !imgError ? `url("${finalBannerUrl}")` : 'none', backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }}>
      {(finalBannerUrl && !imgError) ? (
        <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(5px)' }} />
      ) : (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: '#333' }}>
          <span style={{ fontSize: '60px', marginBottom: '10px' }}>📻</span>
          <span style={{ fontSize: '20px', fontWeight: 'bold', letterSpacing: '2px' }}>MODO RÁDIO</span>
        </div>
      )}
      
      {finalBannerUrl && !imgError && (
        <img 
          src={finalBannerUrl} 
          alt="Radio Banner" 
          onError={() => setImgError(true)}
          style={{ maxWidth: '90%', maxHeight: '90%', objectFit: 'contain', zIndex: 5, boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }} 
        />
      )}
      
      {radioUrl && (
        <div style={{ position: 'absolute', bottom: '20px', zIndex: 10, width: '90%', textAlign: 'center' }}>
          <div style={{ color: '#aaa', fontSize: '12px', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '1px' }}>Sinal de Áudio Ativo</div>
          <audio src={radioUrl} autoPlay loop style={{ width: '100%' }} volume={radioVolume} />
          <div style={{ height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden', marginTop: '10px' }}>
            <div style={{ width: '100%', height: '100%', background: 'linear-gradient(90deg, #646cff, #ef4444)', animation: 'progress-shimmer 2s infinite' }} />
          </div>
        </div>
      )}
    </div>
  );
};

interface ScheduledProgram {
  id: string;
  video: VideoItem;
  date: string; // "YYYY-MM-DD"
  startTime: string; // "14:00"
  durationMinutes: number;
  channelId: string;
}


interface OverlayLayer {
  id: string;
  type: 'text' | 'ticker' | 'clock' | 'image';
  enabled: boolean;
  label: string;
  text: string;
  x: number;           // 0-100 % of canvas
  y: number;           // 0-100 % of canvas
  color: string;
  fontSize: number;
  bgEnabled: boolean;
  bgFullWidth: boolean; // barra que ocupa 100% da largura
  scrollSpeed: number;  // px/s no espaço 1920px
  scrollDir: 'left' | 'right';
  imageUrl?: string;   // base64 data URL for PNG logos
  imageWidth?: number; // width in % of canvas
}
interface OverlayConfig {
  enabled: boolean;
  layers: OverlayLayer[];
}
const defaultOverlay: OverlayConfig = { 
  enabled: true, 
  layers: [
    {
      id: '1', type: 'text', enabled: true, label: 'IEQ TV', text: 'IEQ TV', 
      x: 5, y: 5, color: '#ffffff', fontSize: 32, bgEnabled: true, bgFullWidth: false, 
      scrollSpeed: 0, scrollDir: 'left'
    },
    {
      id: '2', type: 'text', enabled: true, label: 'AO VIVO', text: '🔴 AO VIVO', 
      x: 5, y: 12, color: '#ff0000', fontSize: 18, bgEnabled: true, bgFullWidth: false, 
      scrollSpeed: 0, scrollDir: 'left'
    },
    {
      id: '3', type: 'clock', enabled: true, label: 'Relógio', text: '', 
      x: 82, y: 5, color: '#ffffff', fontSize: 24, bgEnabled: true, bgFullWidth: false, 
      scrollSpeed: 0, scrollDir: 'left'
    },
    {
      id: '4', type: 'ticker', enabled: true, label: 'Ticker Notícias', text: 'SEJA BEM-VINDO À IEQ TV - PROGRAMAÇÃO 24 HORAS NO AR - FIQUE CONECTADO CONOSCO!', 
      x: 0, y: 90, color: '#ffffff', fontSize: 24, bgEnabled: true, bgFullWidth: true, 
      scrollSpeed: 2, scrollDir: 'left'
    }
  ] 
};


function App() {
  const [activeTab, setActiveTab] = useState('schedule');
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [connections, setConnections] = useState<{ twitch: string | null, youtube: string | null, local: boolean }>({ twitch: null, youtube: null, local: false });
  const [loading, setLoading] = useState(false);
  const [librarySearch, setLibrarySearch] = useState('');
  const [libraryFilter, setLibraryFilter] = useState<'all' | 'local' | 'youtube' | 'twitch'>('all');
  
  // Phase 3: Schedule State
  const [scheduledPrograms, setScheduledPrograms] = useState<ScheduledProgram[]>([]);
  const [selectedVideoId, setSelectedVideoId] = useState('');
  const [customDuration] = useState('60');
  const [radioUrl] = useState('');
  const [bannerUrl] = useState('');
  const [fallbackRadioUrl, setFallbackRadioUrl] = useState(() => localStorage.getItem('fallbackRadioUrl') || 'https://stm.painelvox.net:7012/stream');
  const [fallbackBannerUrl, setFallbackBannerUrl] = useState(() => localStorage.getItem('fallbackBannerUrl') || 'https://www.radioieqpc.com.br/public/04066-2024-02-19.jpg');
  const [selectedTime, setSelectedTime] = useState('14:00');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [viewDate, setViewDate] = useState(new Date().toISOString().split('T')[0]);
  
  const [channels, setChannels] = useState([{ id: 'c1', name: 'Principal' }]);
  const [autoFallback, setAutoFallback] = useState(() => localStorage.getItem('autoFallback') === 'true');
  const [selectedChannelId, setSelectedChannelId] = useState('c1');
  const [newChannelName, setNewChannelName] = useState('');
  const [radioVolume, setRadioVolume] = useState(1); // 0-1, controla volume do rádio

  // URL Input State
  const [youtubeUrlInput, setYoutubeUrlInput] = useState('');

  // API Keys State
  const [twitchClientId, setTwitchClientId] = useState('');
  const [youtubeClientId, setYoutubeClientId] = useState('');
  const [youtubeClientSecret, setYoutubeClientSecret] = useState('');
  const [ytError, setYtError] = useState('');

  // Overlay State
  const [overlayConfig, setOverlayConfig] = useState<OverlayConfig>(defaultOverlay);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const previewRef = React.useRef<HTMLDivElement>(null);
  const timelineRef = React.useRef<HTMLDivElement>(null);
  const [streamLogs, setStreamLogs] = useState<string[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);

  const updateLayer = (id: string, updates: Partial<OverlayLayer>) =>
    setOverlayConfig(prev => ({ ...prev, layers: prev.layers.map(l => l.id === id ? { ...l, ...updates } : l) }));

  const addLayer = (type: OverlayLayer['type']) => {
    const presets: Record<string, Partial<OverlayLayer>> = {
      text:   { text: 'Meu Texto',            x: 5,  y: 5,  fontSize: 40, bgEnabled: true,  bgFullWidth: false, scrollSpeed: 150, scrollDir: 'left' },
      ticker: { text: 'Mensagem em movimento...📡', x: 0,  y: 92, fontSize: 30, bgEnabled: true,  bgFullWidth: true,  scrollSpeed: 180, scrollDir: 'left' },
      clock:  { text: '',                     x: 78, y: 4,  fontSize: 32, bgEnabled: true,  bgFullWidth: false, scrollSpeed: 150, scrollDir: 'left' },
      image:  { text: '',                     x: 2,  y: 2,  fontSize: 0,  bgEnabled: false, bgFullWidth: false, scrollSpeed: 0,   scrollDir: 'left', imageUrl: '', imageWidth: 18 },
    };
    const layer: OverlayLayer = {
      id: Date.now().toString(), type, enabled: true,
      label: type === 'ticker' ? 'Ticker →' : type === 'clock' ? 'Relógio' : type === 'image' ? 'Logo PNG' : 'Texto',
      color: '#ffffff', ...presets[type]
    } as OverlayLayer;
    setOverlayConfig(prev => ({ ...prev, layers: [...prev.layers, layer] }));
    setSelectedLayerId(layer.id);
  };

  const removeLayer = (id: string) => {
    setOverlayConfig(prev => ({ ...prev, layers: prev.layers.filter(l => l.id !== id) }));
    setSelectedLayerId(null);
  };

  const handlePreviewMouseMove = (e: React.MouseEvent) => {
    if (!draggingId || !previewRef.current) return;
    const rect = previewRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(99, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(99, ((e.clientY - rect.top) / rect.height) * 100));
    updateLayer(draggingId, { x, y });
  };

  const [showStreamKey, setShowStreamKey] = useState(false);

  // RTMP Streaming State
  const [rtmpUrl, setRtmpUrl] = useState(() => localStorage.getItem('rtmpUrl') || 'rtmp://gru02.contribute.live-video.net/app');
  const [streamKey, setStreamKey] = useState(() => localStorage.getItem('streamKey') || 'live_1492739470_skWF8fBFUcNr0h5Olhw7yljHElvfGK');
  const [hwAccel, setHwAccel] = useState(() => localStorage.getItem('hwAccel') === 'true');
  const [isStreaming, setIsStreaming] = useState(false);
  
  // Restreaming State
  const [restreamEnabled, setRestreamEnabled] = useState(() => localStorage.getItem('restreamEnabled') === 'true');
  const [restreamUrl, setRestreamUrl] = useState(() => localStorage.getItem('restreamUrl') || '');

  // Phase 4: Live Player State
  const [currentTimeTick, setCurrentTimeTick] = useState(new Date());


  // Helper to parse "HH:MM:SS" or "MM:SS" into minutes
  const parseDuration = (durationStr: string) => {
    if (!durationStr) return 60;
    const parts = durationStr.split(':').map(Number);
    let mins = 0;
    if (parts.length === 3) mins = parts[0] * 60 + parts[1] + parts[2] / 60;
    else if (parts.length === 2) mins = parts[0] + parts[1] / 60;
    else mins = 60;
    return mins > 0 ? mins : 1; // Mínimo de 1 minuto
  };

  useEffect(() => {
    const loadVideos = async () => {
      setLoading(true);
      setYtError('');
      try {
        // Twitch e YouTube carregados independentemente para não bloquear um ao outro
        const twitchData = connections.twitch
          ? await fetchTwitchVods(connections.twitch, twitchClientId).catch(e => { console.error(e); return []; })
          : [];

        let ytData: VideoItem[] = [];
        if (connections.youtube) {
          try {
            ytData = await fetchYouTubeVideos(connections.youtube);
          } catch (e: any) {
            const msg = e?.message || String(e);
            setYtError(msg);
            console.error('[YouTube]', msg);
          }
        }

        // Mantém os vídeos locais na biblioteca ao invés de sobrescrever
        setVideos(prev => {
          const locals = prev.filter(v => v.platform === 'local');
          return [...twitchData, ...ytData, ...locals];
        });
      } finally {
        setLoading(false);
      }
    };
    
    loadVideos();
  }, [connections.twitch, connections.youtube]); // Roda apenas se Twitch ou YT mudarem

  // Persistência: Carregar dados salvos na inicialização
  useEffect(() => {
    const loadSavedData = async () => {
      try {
        // @ts-ignore
        const ipcRenderer = window.require ? window.require('electron').ipcRenderer : null;
        let savedData = null;

        if (ipcRenderer) {
          const result = await ipcRenderer.invoke('load-data');
          if (result.success && result.data) savedData = result.data;
        } else {
          // Fallback: localStorage para modo browser
          const raw = localStorage.getItem('streamtv-data');
          if (raw) savedData = JSON.parse(raw);
        }

        if (savedData) {
          const d = savedData;
          if (d.scheduledPrograms) setScheduledPrograms(d.scheduledPrograms);
          if (d.channels) setChannels(d.channels);
          if (d.twitchClientId) setTwitchClientId(d.twitchClientId);
          if (d.youtubeClientId) setYoutubeClientId(d.youtubeClientId);
          if (d.youtubeClientSecret) setYoutubeClientSecret(d.youtubeClientSecret);
          if (d.rtmpUrl) setRtmpUrl(d.rtmpUrl);
          if (d.streamKey) setStreamKey(d.streamKey);
          if (d.restreamEnabled !== undefined) setRestreamEnabled(d.restreamEnabled);
          if (d.restreamUrl !== undefined) setRestreamUrl(d.restreamUrl);
          if (d.selectedChannelId) setSelectedChannelId(d.selectedChannelId);
          if (d.overlayConfig) {
            if (Array.isArray(d.overlayConfig.layers)) {
              setOverlayConfig(d.overlayConfig);
            } else {
              setOverlayConfig({ enabled: false, layers: [] });
            }
          }
          if (d.localVideos && d.localVideos.length > 0) {
            setVideos(d.localVideos);
            setConnections(prev => ({ ...prev, local: true }));
          }
          console.log('[StreamTV] Dados restaurados com sucesso.');
        } else {
          // Nenhum dado salvo - criar dados de demonstração para a simulação
          console.log('[StreamTV] Inicializando dados de demonstração...');
          
          // Vídeos de demonstração
          const demoVideos: VideoItem[] = [
            { id: 'demo-1', title: '🎵 Louvor IEQ - Domingo de Manhã', duration: '00:42:30', thumbnail: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=400&q=80', platform: 'local', date: new Date().toLocaleDateString() },
            { id: 'demo-2', title: '📖 Estudo Bíblico - João 3:16', duration: '01:15:00', thumbnail: 'https://images.unsplash.com/photo-1504052434568-70ad5836ab65?auto=format&fit=crop&w=400&q=80', platform: 'local', date: new Date().toLocaleDateString() },
            { id: 'demo-3', title: '🙏 Culto IEQ - Pregação', duration: '02:05:00', thumbnail: 'https://images.unsplash.com/photo-1438232992991-995b7058bbb3?auto=format&fit=crop&w=400&q=80', platform: 'local', date: new Date().toLocaleDateString() },
            { id: 'demo-4', title: '🎤 Testemunhos - Série Especial', duration: '00:55:00', thumbnail: 'https://images.unsplash.com/photo-1478737270239-2f02b77fc618?auto=format&fit=crop&w=400&q=80', platform: 'local', date: new Date().toLocaleDateString() },
            { id: 'demo-5', title: '🎶 Grupo de Jovens - Ao Vivo', duration: '01:30:00', thumbnail: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=400&q=80', platform: 'local', date: new Date().toLocaleDateString() },
            { id: 'demo-6', title: '📺 IEQ TV - Programa Especial', duration: '02:30:00', thumbnail: 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&w=400&q=80', platform: 'local', date: new Date().toLocaleDateString() },
            { id: 'demo-7', title: '🎬 Documentário: História da Igreja', duration: '01:45:00', thumbnail: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80', platform: 'local', date: new Date().toLocaleDateString() },
            { id: 'demo-8', title: '🎙️ Podcast IEQ - Entrevistas', duration: '01:00:00', thumbnail: 'https://images.unsplash.com/photo-1478737270239-2f02b77fc618?auto=format&fit=crop&w=400&q=80', platform: 'local', date: new Date().toLocaleDateString() },
          ];
          setVideos(demoVideos);
          setConnections(prev => ({ ...prev, local: true }));

          // Programação de demonstração para hoje
          const todayStr = new Date().toISOString().split('T')[0];
          const demoPrograms: ScheduledProgram[] = [
            { id: 'sched-1', video: demoVideos[1], date: todayStr, startTime: '08:00', durationMinutes: 60, channelId: 'c1' },
            { id: 'sched-2', video: demoVideos[2], date: todayStr, startTime: '09:30', durationMinutes: 90, channelId: 'c1' },
            { id: 'sched-3', video: demoVideos[0], date: todayStr, startTime: '12:00', durationMinutes: 45, channelId: 'c1' },
            { id: 'sched-4', video: demoVideos[5], date: todayStr, startTime: '14:00', durationMinutes: 120, channelId: 'c1' },
            { id: 'sched-5', video: demoVideos[3], date: todayStr, startTime: '17:00', durationMinutes: 55, channelId: 'c1' },
            { id: 'sched-6', video: demoVideos[4], date: todayStr, startTime: '19:00', durationMinutes: 90, channelId: 'c1' },
            { id: 'sched-7', video: demoVideos[6], date: todayStr, startTime: '21:00', durationMinutes: 105, channelId: 'c1' },
            { id: 'sched-8', video: demoVideos[7], date: todayStr, startTime: '23:00', durationMinutes: 60, channelId: 'c1' },
          ];
          setScheduledPrograms(demoPrograms);
        }
      } catch (e) {
        console.error('[StreamTV] Erro ao carregar dados:', e);
      }
    };
    loadSavedData();
  }, []); // Roda uma única vez na montagem

  // Persistência: Salvar automaticamente quando dados mudam
  const isFirstRender = useRef(true);
  useEffect(() => {
    // Pula o primeiro render (evita salvar dados vazios por cima dos salvos)
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const saveData = async () => {
      try {
        // @ts-ignore
        const ipcRenderer = window.require ? window.require('electron').ipcRenderer : null;
        const localVideos = videos.filter(v => v.platform === 'local');
        const dataToSave = {
          scheduledPrograms, channels, twitchClientId, youtubeClientId,
          youtubeClientSecret, rtmpUrl, streamKey, selectedChannelId, localVideos, overlayConfig,
          restreamEnabled, restreamUrl
        };
        if (ipcRenderer) {
          await ipcRenderer.invoke('save-data', dataToSave);
        } else {
          // Fallback: localStorage para modo browser
          localStorage.setItem('streamtv-data', JSON.stringify(dataToSave));
        }
      } catch (e) {
        console.error('[StreamTV] Erro ao salvar:', e);
      }
    };
    saveData();
    localStorage.setItem('autoFallback', String(autoFallback));
  }, [scheduledPrograms, channels, twitchClientId, youtubeClientId, youtubeClientSecret, rtmpUrl, streamKey, videos, overlayConfig, autoFallback, restreamEnabled, restreamUrl]);

  // Clock Tick para manter o sistema sincronizado (Horário de Brasília)
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTimeTick(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll para o horário atual ao abrir a grade
  useEffect(() => {
    if (activeTab === 'schedule' && timelineRef.current) {
      const todayStr = new Date().toISOString().split('T')[0];
      if (viewDate === todayStr) {
        const now = new Date();
        const minutes = now.getHours() * 60 + now.getMinutes();
        // Cada hora tem 200px (definido no getBlockStyle e no Marcador)
        const scrollPos = (minutes / 60) * 200 - 300; // Subtrai 300 para centralizar um pouco
        timelineRef.current.scrollLeft = Math.max(0, scrollPos);
      }
    }
  }, [activeTab, viewDate]);
  
  // Listen for Stream Status and Logs from Electron
  useEffect(() => {
    // @ts-ignore
    const ipcRenderer = window.require ? window.require('electron').ipcRenderer : null;
    if (!ipcRenderer) return;

    const onStatus = (_: any, data: { status: string, message?: string }) => {
      if (data.status === 'streaming') setIsStreaming(true);
      else if (data.status === 'idle' || data.status === 'error') {
        setIsStreaming(false);
        if (data.message) setStreamLogs(prev => [...prev.slice(-50), `[SISTEMA] ${data.message}`]);
      }
    };

    const onLog = (_: any, msg: string) => {
      setStreamLogs(prev => [...prev.slice(-100), msg]);
    };

    ipcRenderer.on('stream-status', onStatus);
    ipcRenderer.on('stream-log', onLog);
    return () => {
      ipcRenderer.removeListener('stream-status', onStatus);
      ipcRenderer.removeListener('stream-log', onLog);
    };
  }, []);

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [streamLogs]);


  // Helper to format seconds to HH:MM:SS
  const formatTime = (totalSeconds: number) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const getLocalVideoDuration = (url: string): Promise<number> => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.src = url;
      video.onloadedmetadata = () => {
        resolve(video.duration);
      };
      video.onerror = () => {
        resolve(0); // Em caso de erro, duração 0
      };
    });
  };

  const handleConnectLocal = async () => {
    if (connections.local) {
      setConnections(prev => ({ ...prev, local: false }));
      setVideos(prev => prev.filter(v => v.platform !== 'local'));
      return;
    }
    try {
      // @ts-ignore
      const ipcRenderer = window.require ? window.require('electron').ipcRenderer : null;
      if (ipcRenderer) {
        const files = await ipcRenderer.invoke('select-folder');
        if (files && files.length > 0) {
          setLoading(true);
          const localVideos = await Promise.all(files.map(async (f: any) => {
            const durationSeconds = await getLocalVideoDuration(f.path);
            return {
              id: f.path, // ID armazena o file:/// path para podermos tocar no player
              title: f.name,
              duration: formatTime(Math.round(durationSeconds)),
              thumbnail: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?auto=format&fit=crop&w=400&q=80',
              platform: 'local',
              date: new Date().toLocaleDateString()
            };
          }));
          
          setVideos(prev => {
            const others = prev.filter(v => v.platform !== 'local');
            return [...others, ...localVideos];
          });
          setConnections(prev => ({ ...prev, local: true }));
          setLoading(false);
          alert(`Importados ${localVideos.length} vídeos locais com sucesso!`);
        }
      } else {
        // Fallback: seletor de arquivo nativo do browser
        fileInputRef.current?.click();
      }
    } catch(err) {
      alert(`Falha ao ler pasta: ${err}`);
      setLoading(false);
    }
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setLoading(true);
    const localVideos = await Promise.all(files.map(async (file) => {
      const url = URL.createObjectURL(file);
      const durationSeconds = await getLocalVideoDuration(url);
      return {
        id: url,
        title: file.name.replace(/\.[^/.]+$/, ''),
        duration: formatTime(Math.round(durationSeconds)),
        thumbnail: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?auto=format&fit=crop&w=400&q=80',
        platform: 'local' as const,
        date: new Date().toLocaleDateString()
      };
    }));
    setVideos(prev => {
      const others = prev.filter(v => v.platform !== 'local');
      return [...others, ...localVideos];
    });
    setConnections(prev => ({ ...prev, local: true }));
    setLoading(false);
    alert(`Importados ${localVideos.length} vídeo(s) com sucesso!`);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleConnect = async (platform: 'twitch' | 'youtube') => {
    if (!connections[platform]) {
      try {
        // @ts-ignore: window.require is available due to contextIsolation: false
        const ipcRenderer = window.require ? window.require('electron').ipcRenderer : null;
        
        if (ipcRenderer) {
          // Salvar IDs antes de tentar login
          await ipcRenderer.invoke('save-client-ids', { twitchId: twitchClientId, youtubeId: youtubeClientId, youtubeSecret: youtubeClientSecret });
          const channel = platform === 'twitch' ? 'login-twitch' : 'login-youtube';
          const token = await ipcRenderer.invoke(channel);
          if (token) {
            console.log(`${platform} Token recebido:`, token);
            alert(`${platform === 'twitch' ? 'Twitch' : 'YouTube'} Autenticada com sucesso! (Token recebido)`);
            setConnections(prev => ({ ...prev, [platform]: token }));
          }
        } else {
          alert("Erro: ipcRenderer não encontrado. Certifique-se de rodar via Electron.");
        }
      } catch (err) {
        alert(`Falha no login: ${err}`);
      }
    } else {
      // Disconnect logic
      setConnections(prev => ({ ...prev, [platform]: null }));
    }
  };

  const handleAddProgram = () => {
    let video = videos.find(v => v.id === selectedVideoId);
    
    if (selectedVideoId === '__camera__') {
      video = { id: '__camera__', title: 'Câmera ao Vivo', duration: `${customDuration}:00`, thumbnail: '', platform: 'camera', date: new Date().toISOString() };
    } else if (selectedVideoId === '__webradio__') {
      video = { id: '__webradio__', title: 'Rádio Web', duration: `${customDuration}:00`, thumbnail: '', platform: 'webradio', date: new Date().toISOString(), radioUrl, bannerUrl };
    }

    if (!video) return alert("Selecione um vídeo ou fonte!");
    
    const exists = scheduledPrograms.find(p => p.date === selectedDate && p.startTime === selectedTime && p.channelId === selectedChannelId);
    if (exists) {
      return alert("Já existe um vídeo agendado para este dia e horário neste programa!");
    }

    let duration = selectedVideoId === '__camera__' || selectedVideoId === '__webradio__' 
      ? parseInt(customDuration) || 60 
      : Math.round(parseDuration(video.duration));
      
    if (duration < 1) duration = 1; // Força no mínimo 1 minuto

    const newProgram: ScheduledProgram = {
      id: Date.now().toString(),
      video,
      date: selectedDate,
      startTime: selectedTime,
      durationMinutes: duration,
      channelId: selectedChannelId
    };

    setScheduledPrograms(prev => [...prev, newProgram].sort((a, b) => a.startTime.localeCompare(b.startTime)));
  };

  const handleAddChannel = () => {
    if (!newChannelName.trim()) return alert("Digite o nome do Programa!");
    const newChan = { id: Date.now().toString(), name: newChannelName };
    setChannels(prev => [...prev, newChan]);
    setSelectedChannelId(newChan.id);
    setNewChannelName('');
  };

  const handleDeleteProgram = (id: string) => {
    setScheduledPrograms(prev => prev.filter(p => p.id !== id));
  };

  const getBlockStyle = (program: ScheduledProgram) => {
    const startParts = program.startTime.split(':').map(Number);
    const baseHour = 0; 
    const offsetMinutes = (startParts[0] - baseHour) * 60 + startParts[1];
    
    return {
      left: `${(offsetMinutes / 60) * 200}px`,
      width: `${(program.durationMinutes / 60) * 200}px`,
      position: 'absolute' as const,
      height: '60px',
      top: '20px'
    };
  };

  // Phase 4: Calculate what's playing right now based on actual System Time
  const getCurrentLiveProgram = () => {
    const todayStr = currentTimeTick.toISOString().split('T')[0];

    if (restreamEnabled && restreamUrl) {
      return {
        program: {
          id: 'restream-active',
          video: { 
            id: restreamUrl, 
            title: '📡 RETRANSMISSÃO (RESTREAMING)', 
            platform: 'youtube',
            duration: 'Ao Vivo',
            thumbnail: ''
          },
          startTime: '00:00',
          durationMinutes: 1440,
          date: todayStr,
          channelId: selectedChannelId || 'c1'
        } as ScheduledProgram,
        offsetSeconds: 0,
        isLive: true
      };
    }

    const currentHour = currentTimeTick.getHours();
    const currentMinute = currentTimeTick.getMinutes();
    const currentSecond = currentTimeTick.getSeconds();
    
    const currentTotalSeconds = currentHour * 3600 + currentMinute * 60 + currentSecond;

    for (const p of scheduledPrograms) {
      // Se não houver data, assume que é legado e tenta tocar hoje
      if (p.date && p.date !== todayStr) continue;

      const pParts = p.startTime.split(':').map(Number);
      const pStartSeconds = pParts[0] * 3600 + pParts[1] * 60;
      const pEndSeconds = pStartSeconds + p.durationMinutes * 60;

      if (currentTotalSeconds >= pStartSeconds && currentTotalSeconds < pEndSeconds) {
        return {
          program: p,
          offsetSeconds: currentTotalSeconds - pStartSeconds,
          isLive: true
        };
      }
    }
    
    if (autoFallback && fallbackRadioUrl) {
       return {
         program: {
           id: 'auto-fallback',
           video: { 
             id: '__webradio__', 
             title: 'RÁDIO (AUTOMÁTICO)', 
             platform: 'webradio', 
             radioUrl: fallbackRadioUrl, 
             bannerUrl: fallbackBannerUrl 
           },
           startTime: '00:00',
           durationMinutes: 1440,
           date: todayStr,
           channelId: selectedChannelId
         } as ScheduledProgram,
         offsetSeconds: 0,
         isLive: true
       };
    }

    // Phase 5: Auto DJ Logic
    const autoDjConfig = JSON.parse(localStorage.getItem('autodj-config') || '{"enabled":false}');
    if (autoDjConfig.enabled && videos.length > 0) {
      // Logic to pick a "random" video based on the current minute to keep it stable
      // across refreshes but changing over time. 
      // For a real Auto DJ, we'd want a more robust state, but this is a good start.
      const seed = Math.floor(currentTimeTick.getTime() / (1000 * 60 * 5)); // changes every 5 mins
      const videoIndex = seed % videos.length;
      const adVideo = videos[videoIndex];

      return {
        program: {
          id: 'auto-dj-active',
          video: adVideo,
          startTime: '00:00',
          durationMinutes: 1440,
          date: todayStr,
          channelId: selectedChannelId || 'c1'
        } as ScheduledProgram,
        offsetSeconds: (currentTimeTick.getTime() / 1000) % 300, // simple loop offset
        isLive: true
      };
    }

    return { program: null, offsetSeconds: 0, isLive: false };
  };

  const { program: liveProgram, offsetSeconds, isLive } = getCurrentLiveProgram();

  const getNextProgram = () => {
    const todayStr = currentTimeTick.toISOString().split('T')[0];
    const nowSecs = currentTimeTick.getHours() * 3600 + currentTimeTick.getMinutes() * 60 + currentTimeTick.getSeconds();
    return scheduledPrograms
      .filter(p => p.date === todayStr)
      .filter(p => {
        const parts = p.startTime.split(':').map(Number);
        return (parts[0] * 3600 + parts[1] * 60) > nowSecs;
      })
      .sort((a, b) => a.startTime.localeCompare(b.startTime))[0] || null;
  };
  const nextProgram = getNextProgram();

  const getNextCountdown = () => {
    if (!nextProgram) return '--:--:--';
    const nowSecs = currentTimeTick.getHours() * 3600 + currentTimeTick.getMinutes() * 60 + currentTimeTick.getSeconds();
    const parts = nextProgram.startTime.split(':').map(Number);
    const diff = (parts[0] * 3600 + parts[1] * 60) - nowSecs;
    return formatTime(diff);
  };


  const nowInMinutes = currentTimeTick.getHours() * 60 + currentTimeTick.getMinutes() + (currentTimeTick.getSeconds() / 60);
  const timeMarkerLeft = (nowInMinutes / 60) * 200;

  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (videoRef.current && isLive && activeTab === 'live') {
      if (Math.abs(videoRef.current.currentTime - offsetSeconds) > 2) {
        videoRef.current.currentTime = offsetSeconds;
      }
    }
  }, [offsetSeconds, isLive, activeTab]);

  // Auto-switch RTMP: troca entre vídeo e screensaver quando streaming
  const lastLiveProgramId = useRef<string | null>(null);
  useEffect(() => {
    if (!isStreaming) return;

    const currentId = liveProgram?.id || null;
    if (currentId === lastLiveProgramId.current) return;
    lastLiveProgramId.current = currentId;

    const doSwitch = async () => {
      try {
        // @ts-ignore
        const ipcRenderer = window.require ? window.require('electron').ipcRenderer : null;
        if (!ipcRenderer) return;

        const isWebRadioProgram = liveProgram?.video?.platform === 'webradio';

        if (currentId === 'restream-active') {
          let finalPath = restreamUrl;
          if (restreamUrl.includes('youtube.com') || restreamUrl.includes('youtu.be') || restreamUrl.includes('twitch.tv')) {
            const result = await ipcRenderer.invoke('resolve-youtube-url', { url: restreamUrl });
            if (result.success) {
              finalPath = `__ytlive__:${result.url}`;
            } else {
              console.error('[StreamTV] Falha ao resolver URL yt-dlp:', result.error);
              return; // não troca pra uma URL inválida
            }
          }
          await ipcRenderer.invoke('switch-stream', {
            videoPath: finalPath,
            offsetSeconds: 0,
            overlayConfig,
            programTitle: 'Retransmissão',
            fallbackUrl: fallbackRadioUrl,
            fallbackBanner: fallbackBannerUrl,
            mode: 'video',
            hwAccel
          });
        } else if (currentId && liveProgram && !isWebRadioProgram) {
          // Programa de vídeo normal
          await ipcRenderer.invoke('switch-stream', {
            videoPath: liveProgram.video.id,
            offsetSeconds,
            overlayConfig,
            programTitle: liveProgram.video.title,
            fallbackUrl: fallbackRadioUrl,
            fallbackBanner: fallbackBannerUrl,
            mode: 'video',
            hwAccel
          });
        } else {
          // Rádio automática ou sem programa
          await ipcRenderer.invoke('switch-stream', {
            videoPath: null,
            offsetSeconds: 0,
            overlayConfig,
            programTitle: liveProgram?.video?.title || '',
            fallbackUrl: liveProgram?.video?.radioUrl || fallbackRadioUrl,
            fallbackBanner: liveProgram?.video?.bannerUrl || fallbackBannerUrl,
            mode: 'radio',
            hwAccel
          });
        }
      } catch (e) {
        console.error('[StreamTV] Erro ao trocar stream:', e);
      }
    };
    doSwitch();
  }, [isStreaming, liveProgram?.id, restreamEnabled, restreamUrl]);

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="logo-area">
          <span className="tv-icon">📺</span>
          <span>StreamTV <span style={{ color: 'var(--accent-primary)', fontSize: '12px', fontWeight: '400' }}>MCR PRO</span></span>
        </div>

        <div className="nav-item-group" style={{ marginBottom: '20px' }}>
          <div style={{ padding: '0 16px 8px 16px', fontSize: '10px', fontWeight: 'bold', color: 'var(--text-secondary)', letterSpacing: '1px' }}>CONTROLE MESTRE</div>
          <div className={`nav-item ${activeTab === 'live' ? 'active' : ''}`} onClick={() => setActiveTab('live')}>
            🔴 Modo Transmissão
          </div>
          <div className={`nav-item ${activeTab === 'mcr' ? 'active' : ''}`} onClick={() => setActiveTab('mcr')}>
            🎛️ Master Control (MCR)
          </div>
        </div>

        <div className="nav-item-group" style={{ marginBottom: '20px' }}>
          <div style={{ padding: '0 16px 8px 16px', fontSize: '10px', fontWeight: 'bold', color: 'var(--text-secondary)', letterSpacing: '1px' }}>AUTOMAÇÃO</div>
          <div className={`nav-item ${activeTab === 'autodj' ? 'active' : ''}`} onClick={() => setActiveTab('autodj')}>
            🎵 Auto DJ / Playout
          </div>
          <div className={`nav-item ${activeTab === 'robot' ? 'active' : ''}`} onClick={() => setActiveTab('robot')}>
            🤖 Robô Locutor
          </div>
        </div>

        <div className="nav-item-group" style={{ marginBottom: '20px' }}>
          <div style={{ padding: '0 16px 8px 16px', fontSize: '10px', fontWeight: 'bold', color: 'var(--text-secondary)', letterSpacing: '1px' }}>CONTEÚDO</div>
          <div className={`nav-item ${activeTab === 'schedule' ? 'active' : ''}`} onClick={() => setActiveTab('schedule')}>
            📅 Grade de Horários
          </div>
          <div className={`nav-item ${activeTab === 'library' ? 'active' : ''}`} onClick={() => setActiveTab('library')}>
            📚 Biblioteca de Mídia
          </div>
          <div className={`nav-item ${activeTab === 'gospel' ? 'active' : ''}`} onClick={() => setActiveTab('gospel')}>
            ✝️ Notícias Gospel
          </div>
          <div className={`nav-item ${activeTab === 'overlay' ? 'active' : ''}`} onClick={() => setActiveTab('overlay')}>
            🖼️ Camadas / Overlays
          </div>
        </div>

        <div style={{ marginTop: 'auto' }}>
          <div className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>
            ⚙️ Configurações
          </div>
        </div>
      </aside>

      <main className="main-content">
        <ErrorBoundary>
        {activeTab !== 'live' && activeTab !== 'overlay' && activeTab !== 'mcr' && activeTab !== 'autodj' && activeTab !== 'robot' && (
          <header className="header fade-in">
            <h1>
              {activeTab === 'schedule' && 'Grade de Programação'}
              {activeTab === 'guide' && 'Guia de Programação (EPG)'}
              {activeTab === 'library' && 'Biblioteca de Mídia'}
              {activeTab === 'gospel' && 'Notícias Gospel'}
              {activeTab === 'settings' && 'Configurações do Sistema'}
            </h1>
            <div style={{ display: 'flex', gap: '12px' }}>
               {/* Global status or actions could go here */}
               <div style={{ padding: '8px 16px', backgroundColor: isStreaming ? 'var(--accent-danger)' : 'var(--bg-tertiary)', borderRadius: '20px', fontSize: '11px', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: isStreaming ? '#fff' : '#444', animation: isStreaming ? 'pulse 1.5s infinite' : 'none' }} />
                  {isStreaming ? 'STREAMING ATIVO' : 'SISTEMA OFFLINE'}
               </div>
            </div>
          </header>
        )}

        {/* ... Library & Settings Tabs unchanged ... */}
        {activeTab === 'library' && (
          <div className="schedule-container fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', gap: '20px' }}>
               <div style={{ flex: 1, position: 'relative' }}>
                 <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }}>🔍</span>
                 <input 
                   type="text" 
                   placeholder="Buscar na biblioteca..." 
                   value={librarySearch}
                   onChange={e => setLibrarySearch(e.target.value)}
                   style={{ width: '100%', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', padding: '12px 12px 12px 40px', borderRadius: '8px', color: '#fff', outline: 'none' }}
                 />
               </div>
               <div style={{ display: 'flex', gap: '8px', backgroundColor: 'var(--bg-secondary)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                 {(['all', 'local', 'youtube', 'twitch'] as const).map(f => (
                   <button 
                    key={f}
                    onClick={() => setLibraryFilter(f)}
                    style={{ 
                      padding: '6px 12px', 
                      borderRadius: '6px', 
                      border: 'none', 
                      cursor: 'pointer', 
                      fontSize: '11px',
                      textTransform: 'uppercase',
                      fontWeight: 'bold',
                      backgroundColor: libraryFilter === f ? 'var(--accent-primary)' : 'transparent',
                      color: libraryFilter === f ? '#fff' : 'var(--text-secondary)'
                    }}
                   >
                     {f === 'all' ? 'Tudo' : f}
                   </button>
                 ))}
               </div>
               <button className="btn-primary" onClick={handleConnectLocal} style={{ whiteSpace: 'nowrap' }}>+ Importar Vídeos</button>
            </div>

            {ytError && (
              <div className="glass-panel" style={{ padding: '15px', marginBottom: '20px', borderLeft: '4px solid var(--accent-danger)' }}>
                <strong style={{ color: 'var(--accent-danger)' }}>⚠️ Erro no YouTube:</strong> {ytError}
              </div>
            )}

            {loading ? (
              <div style={{ textAlign: 'center', padding: '100px' }}>
                <div className="pulse" style={{ fontSize: '40px' }}>⏳</div>
                <p>Carregando biblioteca...</p>
              </div>
            ) : (
              <div className="library-grid">
                {videos
                  .filter(v => {
                    const matchesSearch = v.title.toLowerCase().includes(librarySearch.toLowerCase());
                    const matchesFilter = libraryFilter === 'all' || v.platform === libraryFilter;
                    return matchesSearch && matchesFilter;
                  })
                  .map(video => (
                  <div 
                    className="video-card glass-panel" 
                    key={video.id} 
                    draggable 
                    onDragStart={(e) => e.dataTransfer.setData('videoId', video.id)}
                    style={{ cursor: 'grab', transition: '0.2s' }}
                  >
                    <div className="video-thumb" style={{ backgroundImage: `url(${video.thumbnail})`, borderRadius: '8px 8px 0 0' }}>
                      <span className="video-duration" style={{ background: 'rgba(0,0,0,0.8)', padding: '2px 6px', borderRadius: '4px', fontSize: '10px' }}>{video.duration}</span>
                      <div className={`platform-badge ${video.platform}`} style={{ position: 'absolute', top: '8px', right: '8px', width: '20px', height: '20px', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%' }}>
                        {video.platform === 'youtube' ? 'Y' : video.platform === 'twitch' ? 'T' : 'L'}
                      </div>
                    </div>
                    <div className="video-info" style={{ padding: '12px' }}>
                      <div className="video-title" style={{ fontSize: '13px', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{video.title}</div>
                      <div className="video-meta" style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        {video.platform} • {video.date}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Gospel News Tab */}
        {activeTab === 'gospel' && (
          <GospelNewsComponent 
            onOpenLiveStream={() => setActiveTab('live')} 
            onAnnounceNews={async (news: GospelNews) => {
              // 1. Abaixar volume do rádio
              setRadioVolume(0);
              
              // 2. Atualizar ticker com a notícia
              const tickerLayerId = overlayConfig.layers.find(l => l.type === 'ticker')?.id;
              if (tickerLayerId) {
                const originalTickerText = overlayConfig.layers.find(l => l.id === tickerLayerId)?.text || '';
                const newsTickerText = `📢 NOTÍCIA GOSPEL: ${news.title} - ${news.description.substring(0, 200)}`;
                updateLayer(tickerLayerId, { text: newsTickerText });
                
                // 3. Falar a notícia via TTS
                const ttsMessage = `Notícia Gospel: ${news.title}. ${news.description}`;
                speakTts(ttsMessage);
                
                // Usar também o speechSynthesis para preview local
                const synth = window.speechSynthesis;
                if (synth) {
                  synth.cancel();
                  const utterance = new SpeechSynthesisUtterance(ttsMessage);
                  utterance.lang = 'pt-BR';
                  utterance.rate = 0.75;
                  utterance.pitch = 1.1;
                  
                  // 4. Quando terminar de falar, restaurar ticker e volume
                  utterance.onend = () => {
                    setTimeout(() => {
                      updateLayer(tickerLayerId, { text: originalTickerText });
                      setRadioVolume(1);
                    }, 2000);
                  };
                  
                  // Fallback: se não falar em 20 segundos, restaura mesmo assim
                  setTimeout(() => {
                    updateLayer(tickerLayerId, { text: originalTickerText });
                    setRadioVolume(1);
                  }, 20000);
                  
                  synth.speak(utterance);
                } else {
                  // Sem speechSynthesis, restaura após 15 segundos
                  setTimeout(() => {
                    updateLayer(tickerLayerId, { text: originalTickerText });
                    setRadioVolume(1);
                  }, 15000);
                }
              } else {
                // Sem ticker, só fala e restaura volume após tempo estimado
                const ttsMessage = `Notícia Gospel: ${news.title}. ${news.description}`;
                speakTts(ttsMessage);
                setTimeout(() => {
                  setRadioVolume(1);
                }, 15000);
              }
            }}
          />
        )}

        {/* Overlay Editor Tab */}
        {activeTab === 'overlay' && (
          <div style={{ display:'flex', flex:1, flexDirection:'column', overflow:'hidden' }}>

            {/* Toolbar */}
            <div style={{ display:'flex', alignItems:'center', gap:'10px', padding:'12px 20px', backgroundColor:'var(--bg-secondary)', borderBottom:'1px solid var(--border-color)', flexShrink:0 }}>
              <label style={{ display:'flex', alignItems:'center', gap:'8px', cursor:'pointer', marginRight:'10px' }}>
                <input type="checkbox" checked={overlayConfig.enabled}
                  onChange={e => setOverlayConfig(p => ({ ...p, enabled: e.target.checked }))} />
                <span style={{ fontWeight:'bold', color: overlayConfig.enabled ? '#4ade80' : 'var(--text-secondary)' }}>
                  {overlayConfig.enabled ? '● Overlay Ativo' : '○ Overlay Inativo'}
                </span>
              </label>
              <span style={{ color:'var(--text-secondary)', fontSize:'13px' }}>Adicionar camada:</span>
              <button onClick={() => addLayer('text')}   style={{ background:'var(--accent-color)', color:'white', border:'none', padding:'6px 14px', borderRadius:'3px', cursor:'pointer', fontSize:'13px' }}>✏️ Texto</button>
              <button onClick={() => addLayer('ticker')} style={{ background:'#7c3aed', color:'white', border:'none', padding:'6px 14px', borderRadius:'3px', cursor:'pointer', fontSize:'13px' }}>📡 Ticker</button>
              <button onClick={() => addLayer('clock')}  style={{ background:'#0369a1', color:'white', border:'none', padding:'6px 14px', borderRadius:'3px', cursor:'pointer', fontSize:'13px' }}>🕐 Relógio</button>
              <button onClick={() => addLayer('image')}  style={{ background:'#065f46', color:'white', border:'none', padding:'6px 14px', borderRadius:'3px', cursor:'pointer', fontSize:'13px' }}>🖼️ Logo PNG</button>
              <button 
                onClick={() => {
                  if (window.confirm('Deseja redefinir para o layout profissional padrão?')) {
                    setOverlayConfig(defaultOverlay);
                    setSelectedLayerId(null);
                  }
                }} 
                style={{ background:'#333', color:'#aaa', border:'1px solid #444', padding:'6px 14px', borderRadius:'3px', cursor:'pointer', fontSize:'11px', marginLeft:'auto' }}
              >
                🔄 Redefinir Padrão
              </button>
            </div>

            <div style={{ display:'flex', flex:1, overflow:'hidden' }}>

              {/* Preview Canvas */}
              <div style={{ flex:1, padding:'20px', overflow:'auto', display:'flex', flexDirection:'column' }}>
                <p style={{ color:'var(--text-secondary)', fontSize:'12px', marginBottom:'8px' }}>Arraste os elementos no preview para reposicionar. Os tickers rolam automaticamente na live.</p>
                <div
                  ref={previewRef}
                  style={{ position:'relative', width:'100%', aspectRatio:'16/9', backgroundColor:'#080810', border:'1px solid var(--border-color)', overflow:'hidden', cursor: draggingId ? 'grabbing' : 'default', userSelect:'none' }}
                  onMouseMove={handlePreviewMouseMove}
                  onMouseUp={() => setDraggingId(null)}
                  onMouseLeave={() => setDraggingId(null)}
                >
                  {/* Simulated background */}
                  <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', opacity:0.1 }}>
                    <span style={{ fontSize:'64px' }}>📺</span>
                  </div>

                   {overlayConfig.enabled && (overlayConfig.layers || []).filter(l => l.enabled).map(layer => {
                    const isSelected = selectedLayerId === layer.id;

                    // IMAGE layer rendering
                    if (layer.type === 'image') {
                      return (
                        <div
                          key={layer.id}
                          style={{ position: 'absolute', left: `${layer.x}%`, top: `${layer.y}%`, width: `${layer.imageWidth || 20}%`, outline: isSelected ? '2px solid #646cff' : 'none', cursor: 'grab' }}
                          onMouseDown={e => { e.stopPropagation(); setDraggingId(layer.id); setSelectedLayerId(layer.id); }}
                          onClick={() => setSelectedLayerId(layer.id)}
                        >
                          {layer.imageUrl ? (
                            <img src={layer.imageUrl} alt={layer.label} style={{ width: '100%', height: 'auto', display: 'block', filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.8))' }} />
                          ) : (
                            <div style={{ width: '100%', aspectRatio: '3/1', border: '2px dashed #646cff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#646cff', fontSize: '10px', backgroundColor: 'rgba(100,108,255,0.1)' }}>📷 Logo</div>
                          )}
                        </div>
                      );
                    }

                    const fs = `clamp(9px, ${layer.fontSize / 16 * 1.4}vw, ${layer.fontSize * 0.7}px)`;
                    const baseStyle: React.CSSProperties = {
                      position: 'absolute',
                      left: layer.bgFullWidth ? 0 : `${layer.x}%`,
                      top: `${layer.y}%`,
                      width: layer.bgFullWidth ? '100%' : undefined,
                      color: layer.color,
                      fontSize: fs,
                      padding: layer.bgFullWidth ? `3px 10px 3px calc(${layer.x}% + 10px)` : '2px 6px',
                      backgroundColor: layer.bgEnabled ? (layer.bgFullWidth ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.5)') : 'transparent',
                      whiteSpace: layer.bgFullWidth ? 'nowrap' : 'nowrap',
                      outline: isSelected ? '2px solid #646cff' : 'none',
                      cursor: layer.type === 'ticker' ? 'default' : 'grab',
                      boxSizing: 'border-box',
                      fontFamily: layer.type === 'clock' ? 'monospace' : 'inherit',
                      overflow: layer.bgFullWidth ? 'hidden' : undefined,
                    };
                    const content = layer.type === 'clock'
                      ? currentTimeTick.toLocaleTimeString()
                      : layer.type === 'ticker'
                      ? <span style={{ display:'inline-block', animation:`ticker-scroll ${Math.max(5, 300/((layer.scrollSpeed||150)/100))}s linear infinite`, whiteSpace:'nowrap' }}>{layer.text}</span>
                      : (layer.text || '(vazio)');
                    return (
                      <div
                        key={layer.id}
                        style={baseStyle}
                        onMouseDown={e => { e.stopPropagation(); if (layer.type !== 'ticker') { setDraggingId(layer.id); } setSelectedLayerId(layer.id); }}
                        onClick={() => setSelectedLayerId(layer.id)}
                      >
                        {content}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right Panel: Layer List + Editor */}
              <div style={{ width:'340px', backgroundColor:'var(--bg-secondary)', borderLeft:'1px solid var(--border-color)', display:'flex', flexDirection:'column', flexShrink:0 }}>

                {/* Layer List */}
                <div style={{ borderBottom:'1px solid var(--border-color)', padding:'12px' }}>
                  <p style={{ color:'var(--text-secondary)', fontSize:'11px', margin:'0 0 8px 0', textTransform:'uppercase', letterSpacing:'1px' }}>Camadas ({(overlayConfig.layers || []).length})</p>
                  {(overlayConfig.layers || []).length === 0 && <p style={{ color:'var(--text-secondary)', fontSize:'12px', margin:0 }}>Nenhuma camada. Adicione uma acima.</p>}
                  {(overlayConfig.layers || []).map((layer) => (
                    <div
                      key={layer.id}
                      onClick={() => setSelectedLayerId(layer.id)}
                      style={{ display:'flex', alignItems:'center', gap:'8px', padding:'6px 8px', borderRadius:'3px', cursor:'pointer', marginBottom:'4px', backgroundColor: selectedLayerId === layer.id ? 'rgba(100,108,255,0.2)' : 'transparent', border: selectedLayerId === layer.id ? '1px solid rgba(100,108,255,0.5)' : '1px solid transparent' }}
                    >
                      <span style={{ fontSize:'16px' }}>{layer.type === 'ticker' ? '📡' : layer.type === 'clock' ? '🕐' : layer.type === 'image' ? '🖼️' : '✏️'}</span>
                      <span style={{ flex:1, fontSize:'13px', color:'white' }}>{layer.label}</span>
                      <input type="checkbox" checked={layer.enabled} onChange={e => { e.stopPropagation(); updateLayer(layer.id, { enabled: e.target.checked }); }} onClick={e => e.stopPropagation()} />
                    </div>
                  ))}
                </div>

                {/* Selected Layer Editor */}
                <div style={{ flex:1, overflowY:'auto', padding:'16px' }}>
                  {!selectedLayerId && <p style={{ color:'var(--text-secondary)', fontSize:'13px' }}>Selecione uma camada para editar.</p>}
                  {selectedLayerId && (() => {
                    const layer = (overlayConfig.layers || []).find(l => l.id === selectedLayerId);
                    if (!layer) return null;
                    const inp: React.CSSProperties = { backgroundColor:'var(--bg-tertiary)', color:'white', border:'1px solid var(--border-color)', padding:'7px 9px', borderRadius:'3px', outline:'none', width:'100%', boxSizing:'border-box' as any };
                    const lbl: React.CSSProperties = { fontSize:'11px', color:'var(--text-secondary)', display:'block', marginBottom:'4px', marginTop:'12px' };
                    return (
                      <div>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                            <span style={{ fontSize:'18px' }}>{layer.type === 'ticker' ? '📡' : layer.type === 'clock' ? '🕐' : '✏️'}</span>
                            <input value={layer.label} onChange={e => updateLayer(layer.id, { label: e.target.value })} style={{ ...inp, width:'140px', fontWeight:'bold', fontSize:'14px' }} />
                          </div>
                          <button onClick={() => removeLayer(layer.id)} style={{ background:'rgba(220,38,38,0.3)', color:'#fca5a5', border:'1px solid rgba(220,38,38,0.5)', padding:'5px 10px', borderRadius:'3px', cursor:'pointer', fontSize:'12px' }}>🗑 Excluir</button>
                        </div>

                          {layer.type === 'image' && (
                            <div>
                              <span style={lbl}>Arquivo PNG / WEBP / JPG</span>
                              {layer.imageUrl ? (
                                <div style={{ marginBottom: '10px' }}>
                                  <img src={layer.imageUrl} alt="logo" style={{ maxWidth: '100%', maxHeight: '80px', objectFit: 'contain', border: '1px solid #333', borderRadius: '4px', display: 'block', backgroundColor: 'rgba(255,255,255,0.05)', padding: '4px' }} />
                                  <button onClick={() => updateLayer(layer.id, { imageUrl: '' })} style={{ marginTop: '6px', background: 'rgba(220,38,38,0.3)', color: '#fca5a5', border: '1px solid rgba(220,38,38,0.5)', borderRadius: '3px', padding: '4px 10px', cursor: 'pointer', fontSize: '11px', width: '100%' }}>✕ Remover</button>
                                </div>
                              ) : (
                                <>
                                  <div style={{ border: '2px dashed #444', borderRadius: '6px', padding: '20px', textAlign: 'center', marginBottom: '8px', cursor: 'pointer', backgroundColor: 'rgba(100,108,255,0.05)' }}
                                    onClick={() => (document.getElementById(`img-upload-${layer.id}`) as HTMLInputElement)?.click()}>
                                    <div style={{ fontSize: '32px', marginBottom: '6px' }}>🖼️</div>
                                    <div style={{ fontSize: '12px', color: '#aaa' }}>Clique para selecionar arquivo</div>
                                  </div>
                                  <button onClick={() => (document.getElementById(`img-upload-${layer.id}`) as HTMLInputElement)?.click()} style={{ ...inp, display: 'block', textAlign: 'center' as any, cursor: 'pointer', backgroundColor: '#646cff22', border: '1px solid #646cff', color: '#fff', padding: '8px', borderRadius: '4px', marginBottom: '8px' }}>📂 Escolher Arquivo</button>
                                </>
                              )}
                              <input id={`img-upload-${layer.id}`} type="file" accept="image/png,image/webp,image/gif,image/jpeg" style={{ display: 'none' }}
                                onChange={e => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = ev => updateLayer(layer.id, { imageUrl: ev.target?.result as string }); reader.readAsDataURL(file); }} />
                              <span style={lbl}>Tamanho: {layer.imageWidth || 18}% da tela</span>
                              <input type="range" min={5} max={60} value={layer.imageWidth || 18} onChange={e => updateLayer(layer.id, { imageWidth: Number(e.target.value) })} style={{ width:'100%' }} />
                              <span style={lbl}>Posição X: {layer.x.toFixed(0)}%</span>
                              <input type="range" min={0} max={90} value={layer.x} onChange={e => updateLayer(layer.id, { x: Number(e.target.value) })} style={{ width:'100%' }} />
                              <span style={lbl}>Posição Y: {layer.y.toFixed(0)}%</span>
                              <input type="range" min={0} max={90} value={layer.y} onChange={e => updateLayer(layer.id, { y: Number(e.target.value) })} style={{ width:'100%' }} />
                            </div>
                          )}

                        {layer.type !== 'clock' && layer.type !== 'image' && <>
                          <span style={lbl}>Texto {layer.type === 'ticker' ? '(rola na live)' : ''}</span>
                          <textarea value={layer.text} onChange={e => updateLayer(layer.id, { text: e.target.value })} rows={3} style={{ ...inp, resize:'vertical', fontFamily:'inherit' }} placeholder="Digite o texto aqui..." />
                        </>}

                        {layer.type !== 'image' && <>
                        <span style={lbl}>Cor do texto</span>
                        <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
                          <input type="color" value={layer.color} onChange={e => updateLayer(layer.id, { color: e.target.value })} style={{ width:'50px', height:'34px', border:'1px solid var(--border-color)', borderRadius:'3px', cursor:'pointer', backgroundColor:'transparent' }} />
                          <input value={layer.color} onChange={e => updateLayer(layer.id, { color: e.target.value })} style={{ ...inp, fontFamily:'monospace', flex:1 }} />
                        </div>

                        <span style={lbl}>Tamanho da fonte: {layer.fontSize}px</span>
                        <input type="range" min={12} max={120} value={layer.fontSize} onChange={e => updateLayer(layer.id, { fontSize: Number(e.target.value) })} style={{ width:'100%' }} />

                        {layer.type !== 'ticker' && <>
                          <span style={lbl}>Posição X: {layer.x.toFixed(0)}%</span>
                          <input type="range" min={0} max={99} value={layer.x} onChange={e => updateLayer(layer.id, { x: Number(e.target.value) })} style={{ width:'100%' }} />
                        </>}

                        <span style={lbl}>Posição Y: {layer.y.toFixed(0)}%</span>
                        <input type="range" min={0} max={99} value={layer.y} onChange={e => updateLayer(layer.id, { y: Number(e.target.value) })} style={{ width:'100%' }} />

                        <span style={lbl}>Fundo</span>
                        <label style={{ display:'flex', alignItems:'center', gap:'8px', cursor:'pointer' }}>
                          <input type="checkbox" checked={layer.bgEnabled} onChange={e => updateLayer(layer.id, { bgEnabled: e.target.checked })} />
                          <span style={{ fontSize:'13px', color:'var(--text-secondary)' }}>Ativar fundo semi-transparente</span>
                        </label>
                        {layer.bgEnabled && (
                          <label style={{ display:'flex', alignItems:'center', gap:'8px', cursor:'pointer', marginTop:'8px' }}>
                            <input type="checkbox" checked={layer.bgFullWidth} onChange={e => updateLayer(layer.id, { bgFullWidth: e.target.checked })} />
                            <span style={{ fontSize:'13px', color:'var(--text-secondary)' }}>Barra de fundo 100% da largura</span>
                          </label>
                        )}
                        </>}

                        {layer.type === 'ticker' && <>
                          <span style={lbl}>Velocidade: {layer.scrollSpeed}px/s</span>
                          <input type="range" min={50} max={800} value={layer.scrollSpeed} onChange={e => updateLayer(layer.id, { scrollSpeed: Number(e.target.value) })} style={{ width:'100%' }} />
                          <span style={lbl}>Direção</span>
                          <div style={{ display:'flex', gap:'8px' }}>
                            {(['left','right'] as const).map(d => (
                              <button key={d} onClick={() => updateLayer(layer.id, { scrollDir: d })}
                                style={{ flex:1, padding:'7px', borderRadius:'3px', cursor:'pointer', border:'1px solid var(--border-color)', backgroundColor: layer.scrollDir === d ? 'var(--accent-color)' : 'var(--bg-tertiary)', color:'white', fontSize:'13px' }}>
                                {d === 'left' ? '⬅ Da direita pra esquerda' : '➡ Da esquerda pra direita'}
                              </button>
                            ))}
                          </div>
                        </>}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'guide' && (
          <div className="schedule-container" style={{ padding: '40px', maxWidth: '900px', margin: '0 auto' }}>
            <h2 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              Guia de Programação
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input 
                  type="date" 
                  value={viewDate} 
                  onChange={(e) => setViewDate(e.target.value)}
                  style={{ backgroundColor: 'var(--bg-tertiary)', color: 'white', border: '1px solid var(--border-color)', padding: '5px 10px', borderRadius: '4px', outline: 'none', fontSize: '14px' }}
                />
              </div>
            </h2>
            
            <div style={{ marginTop: '30px' }}>
              {scheduledPrograms.filter(p => p.date === viewDate).length === 0 ? (
                <div style={{ textAlign: 'center', padding: '100px 0', color: 'var(--text-secondary)' }}>
                  <span style={{ fontSize: '48px', display: 'block', marginBottom: '20px' }}>📋</span>
                  Nada agendado para hoje.
                </div>
              ) : (
                [...scheduledPrograms]
                  .filter(p => p.date === viewDate)
                  .sort((a, b) => a.startTime.localeCompare(b.startTime))
                  .map(program => {
                    const isNow = liveProgram?.id === program.id;
                    const startTimeArr = program.startTime.split(':');
                    const programStartTotal = parseInt(startTimeArr[0]) * 60 + parseInt(startTimeArr[1]);
                    const now = new Date();
                    const nowTotal = now.getHours() * 60 + now.getMinutes();
                    const isPast = !isNow && nowTotal > programStartTotal;

                    return (
                      <div key={program.id} 
                        className={`epg-item ${isNow ? 'epg-now-playing' : ''}`}
                        style={{
                          display: 'flex',
                          padding: '24px 0',
                          borderBottom: '1px solid rgba(255,255,255,0.05)',
                          opacity: isPast ? 0.4 : 1,
                          position: 'relative'
                        }}
                      >
                        {isNow && (
                          <div style={{ position: 'absolute', left: '-25px', top: '50%', transform: 'translateY(-50%)', color: '#ef4444', animation: 'pulse 1.5s infinite' }}>▶</div>
                        )}
                        <div className="epg-time" style={{ 
                          width: '100px', 
                          fontSize: '24px', 
                          fontWeight: 'bold', 
                          color: isNow ? 'var(--accent-color)' : 'white',
                          flexShrink: 0
                        }}>
                          {program.startTime}
                        </div>
                        <div style={{ flex: 1 }}>
                          <h3 style={{ 
                            margin: '0 0 4px 0', 
                            fontSize: '20px', 
                            color: isNow ? 'white' : 'var(--text-secondary)',
                            fontWeight: isNow ? 'bold' : 'normal'
                          }}>
                            {program.video.title}
                            {isNow && <span className="epg-badge-live" style={{ marginLeft: '12px', fontSize: '11px', backgroundColor: '#ef4444', color: 'white', padding: '2px 6px', borderRadius: '2px', verticalAlign: 'middle', textTransform: 'uppercase' }}>No Ar</span>}
                          </h3>
                          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', opacity: 0.8 }}>
                            {program.channelId === 'c1' ? 'Entretenimento' : 'Programa Especial'} • {program.durationMinutes} minutos
                          </div>
                        </div>
                      </div>
                    );
                  })
              )}
            </div>
            
            <style>{`
              @keyframes pulse {
                0% { opacity: 0.4; }
                50% { opacity: 1; }
                100% { opacity: 0.4; }
              }
            `}</style>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="schedule-container fade-in" style={{ maxWidth: '1200px', margin: '0 auto' }}>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px', marginTop: '20px' }}>
              
              {/* Category: Streaming */}
              <div className="glass-panel" style={{ padding: '25px' }}>
                <h2 style={{ fontSize: '18px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span>🚀</span> Transmissão (Streaming)
                </h2>
                <div className="editor-form">
                  <label>RTMP URL (Servidor):</label>
                  <input type="text" value={rtmpUrl} onChange={(e) => { setRtmpUrl(e.target.value); localStorage.setItem('rtmpUrl', e.target.value); }} placeholder="rtmp://a.rtmp.youtube.com/live2" />
                  
                  <label>Chave de Transmissão (Stream Key):</label>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <input type={showStreamKey ? "text" : "password"} value={streamKey} onChange={(e) => { setStreamKey(e.target.value); localStorage.setItem('streamKey', e.target.value); }} style={{ flex: 1 }} />
                    <button onClick={() => setShowStreamKey(!showStreamKey)} className="btn-connect" style={{ height: '42px' }}>{showStreamKey ? 'Ocultar' : 'Mostrar'}</button>
                  </div>

                  <div style={{ marginTop: '15px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={hwAccel} onChange={(e) => setHwAccel(e.target.checked)} />
                      <span>Habilitar Aceleração de Hardware (GPU)</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Category: Fallback & Restream */}
              <div className="glass-panel" style={{ padding: '25px' }}>
                <h2 style={{ fontSize: '18px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span>🔄</span> Fallback & Retransmissão
                </h2>
                
                <div style={{ marginBottom: '25px', paddingBottom: '20px', borderBottom: '1px solid var(--border-color)' }}>
                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 'bold', fontSize: '14px' }}>Modo Retransmissão</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Ignora a grade e transmite uma live externa.</div>
                    </div>
                    <input type="checkbox" checked={restreamEnabled} onChange={(e) => { setRestreamEnabled(e.target.checked); localStorage.setItem('restreamEnabled', e.target.checked.toString()); }} />
                  </label>
                  {restreamEnabled && (
                    <input type="text" value={restreamUrl} onChange={(e) => { setRestreamUrl(e.target.value); localStorage.setItem('restreamUrl', e.target.value); }} placeholder="URL do YouTube/Twitch/M3U8" style={{ width: '100%', marginTop: '10px', backgroundColor: '#000', border: '1px solid #333', padding: '10px', borderRadius: '8px', color: '#fff' }} />
                  )}
                </div>

                <div>
                  <div style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '10px' }}>Rádio de Fallback (Esperas)</div>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>URL da Rádio (MP3/AAC):</label>
                  <input type="text" value={fallbackRadioUrl} onChange={(e) => { setFallbackRadioUrl(e.target.value); localStorage.setItem('fallbackRadioUrl', e.target.value); }} style={{ width: '100%', marginTop: '5px', marginBottom: '10px', backgroundColor: '#000', border: '1px solid #333', padding: '10px', borderRadius: '8px', color: '#fff' }} />
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Banner de Fundo:</label>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '5px' }}>
                    <input type="text" value={fallbackBannerUrl} onChange={(e) => setFallbackBannerUrl(e.target.value)} style={{ flex: 1, backgroundColor: '#000', border: '1px solid #333', padding: '10px', borderRadius: '8px', color: '#fff' }} />
                    <button className="btn-connect" onClick={async () => {
                       // @ts-ignore
                       const ipcRenderer = window.require ? window.require('electron').ipcRenderer : null;
                       if (!ipcRenderer) return alert('Disponível apenas no Electron.');
                       const path = await ipcRenderer.invoke('select-image-file');
                       if (path) setFallbackBannerUrl(path);
                    }}>📁</button>
                  </div>
                </div>
              </div>

              {/* Category: APIs & Accounts */}
              <div className="glass-panel" style={{ padding: '25px', gridColumn: 'span 2' }}>
                <h2 style={{ fontSize: '18px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span>🔌</span> Conexões e APIs
                </h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
                  <div className="connection-card" style={{ background: 'rgba(100, 65, 164, 0.1)', borderColor: 'rgba(100, 65, 164, 0.2)' }}>
                    <div className="connection-info">
                      <div className="platform-icon twitch">Tw</div>
                      <div>
                        <div style={{ fontWeight: 'bold' }}>Twitch</div>
                        <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{connections.twitch ? 'CONECTADO' : 'NÃO VINCULADO'}</div>
                      </div>
                    </div>
                    <button className="btn-connect" onClick={() => handleConnect('twitch')} style={{ background: connections.twitch ? '#4ade80' : '' }}>{connections.twitch ? 'Sair' : 'Conectar'}</button>
                  </div>

                  <div className="connection-card" style={{ background: 'rgba(255, 0, 0, 0.05)', borderColor: 'rgba(255, 0, 0, 0.1)' }}>
                    <div className="connection-info">
                      <div className="platform-icon youtube">Yt</div>
                      <div>
                        <div style={{ fontWeight: 'bold' }}>YouTube</div>
                        <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{connections.youtube ? 'CONECTADO' : 'NÃO VINCULADO'}</div>
                      </div>
                    </div>
                    <button className="btn-connect" onClick={() => handleConnect('youtube')} style={{ background: connections.youtube ? '#4ade80' : '' }}>{connections.youtube ? 'Sair' : 'Conectar'}</button>
                  </div>

                  <div className="connection-card">
                    <div className="connection-info">
                      <div className="platform-icon" style={{ backgroundColor: '#2a2a35' }}>📁</div>
                      <div>
                        <div style={{ fontWeight: 'bold' }}>Pasta Local</div>
                        <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{connections.local ? 'IMPORTADO' : 'VAZIO'}</div>
                      </div>
                    </div>
                    <button className="btn-connect" onClick={handleConnectLocal} style={{ background: connections.local ? '#4ade80' : '' }}>{connections.local ? 'Trocar' : 'Selecionar'}</button>
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}

        {activeTab === 'autodj' && (
          <AutoDJ 
            videos={videos.filter(v => v.platform === 'local')} 
            currentVideo={liveProgram?.id === 'auto-dj-active' ? liveProgram.video : undefined}
            onPlayNext={(v) => {
              console.log("Auto DJ playing next:", v.title);
            }}
          />
        )}

        {activeTab === 'robot' && (
          <div className="fade-in" style={{ flex: 1, overflow: 'hidden' }}>
            <VirtualAnnouncer 
              currentTrack={liveProgram?.video?.title}
              nextTrack={nextProgram?.video?.title}
            />
          </div>
        )}


        {activeTab === 'schedule' && (
          <div className="fade-in" style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            
            {/* Left: Timeline View */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-primary)', overflow: 'hidden' }}>
              <div style={{ padding: '20px 30px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                   <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                     <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>DATA:</span>
                     <input type="date" value={viewDate} onChange={e => setViewDate(e.target.value)} style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: '#fff', padding: '6px 12px', borderRadius: '6px', fontSize: '13px' }} />
                   </div>
                   <button onClick={() => setViewDate(currentTimeTick.toISOString().split('T')[0])} style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--accent-primary)', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>Hoje</button>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {scheduledPrograms.filter(p => p.date === viewDate).length} eventos agendados
                </div>
              </div>

              <div 
                className="timeline-container" 
                style={{ flex: 1, overflow: 'auto', position: 'relative', backgroundColor: '#08080a' }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  const videoId = e.dataTransfer.getData('videoId');
                  if (videoId) {
                    setSelectedVideoId(videoId);
                  }
                }}
              >
                {/* Time Ruler */}
                <div style={{ display: 'flex', position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--bg-primary)', borderBottom: '1px solid var(--border-color)' }}>
                  <div style={{ width: '180px', flexShrink: 0, borderRight: '1px solid var(--border-color)' }}></div>
                  <div style={{ display: 'flex', flex: 1 }}>
                    {Array.from({ length: 24 }).map((_, h) => (
                      <div key={h} style={{ width: '200px', flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.05)', padding: '10px', fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 'bold' }}>
                        {String(h).padStart(2, '0')}:00
                      </div>
                    ))}
                  </div>
                </div>

                {/* Grid Rows */}
                {channels.map(channel => (
                  <div key={channel.id} style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.03)', minHeight: '120px' }}>
                    <div style={{ width: '180px', flexShrink: 0, padding: '20px', borderRight: '1px solid var(--border-color)', backgroundColor: 'var(--bg-secondary)', position: 'sticky', left: 0, zIndex: 5, display: 'flex', alignItems: 'center', fontWeight: 'bold', fontSize: '14px' }}>
                      {channel.name}
                    </div>
                    <div style={{ flex: 1, display: 'flex', position: 'relative' }}>
                      {/* Vertical Hour Markers */}
                      {Array.from({ length: 24 }).map((_, h) => (
                        <div key={h} style={{ width: '200px', flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.02)' }}></div>
                      ))}

                      {/* Current Time Indicator */}
                      {viewDate === currentTimeTick.toISOString().split('T')[0] && (
                        <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${timeMarkerLeft}px`, width: '2px', backgroundColor: 'var(--accent-danger)', zIndex: 50, boxShadow: '0 0 10px rgba(239,68,68,0.5)' }}>
                          <div style={{ width: '10px', height: '10px', backgroundColor: 'var(--accent-danger)', borderRadius: '50%', position: 'absolute', top: -4, left: -4 }}></div>
                        </div>
                      )}

                      {/* Programs */}
                      {scheduledPrograms.filter(p => p.channelId === channel.id && p.date === viewDate).map(program => {
                        const isNow = liveProgram?.id === program.id;
                        return (
                          <div 
                            key={program.id} 
                            className={`program-block ${isNow ? 'on-air' : ''}`}
                            style={{ 
                              ...getBlockStyle(program), 
                              backgroundColor: isNow ? 'rgba(239, 68, 68, 0.15)' : 'rgba(100, 108, 255, 0.05)',
                              border: isNow ? '1px solid var(--accent-danger)' : '1px solid rgba(100, 108, 255, 0.2)',
                              borderRadius: '8px',
                              padding: '12px',
                              boxSizing: 'border-box',
                              overflow: 'hidden',
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'space-between'
                            }}
                          >
                            <div>
                              <div style={{ fontSize: '11px', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{program.video.title}</div>
                              <div style={{ fontSize: '9px', color: 'var(--text-secondary)', marginTop: '4px' }}>{program.startTime} - {program.durationMinutes}min</div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                               <button 
                                 onClick={(e) => { e.stopPropagation(); handleDeleteProgram(program.id); }}
                                 style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: '#888', cursor: 'pointer', padding: '4px', borderRadius: '4px', fontSize: '10px' }}
                               >🗑️</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Controls Panel */}
            <div style={{ width: '380px', backgroundColor: 'var(--bg-secondary)', borderLeft: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              
              <div style={{ padding: '24px', borderBottom: '1px solid var(--border-color)' }}>
                 <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '20px' }}>AGENDAR EVENTO</h3>
                 
                 <div className="editor-form">
                    <label>Tipo de Evento:</label>
                    <select 
                      value={selectedVideoId} 
                      onChange={e => setSelectedVideoId(e.target.value)}
                      style={{ marginBottom: '15px' }}
                    >
                      <option value="">-- Selecione um Vídeo --</option>
                      {videos.map(v => <option key={v.id} value={v.id}>{v.title}</option>)}
                      <optgroup label="Entradas Especiais">
                        <option value="__camera__">📸 Câmera ao Vivo</option>
                        <option value="__webradio__">📻 Rádio / Fallback</option>
                      </optgroup>
                    </select>

                    <div style={{ marginBottom: '15px', padding: '12px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                      <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>🎬 YouTube URL:</label>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input 
                          type="text" 
                          placeholder="https://youtube.com/watch?v=..." 
                          value={youtubeUrlInput}
                          onChange={e => setYoutubeUrlInput(e.target.value)}
                          style={{ flex: 1, backgroundColor: '#000', border: '1px solid #333', padding: '8px 10px', borderRadius: '6px', color: '#fff', fontSize: '12px' }}
                        />
                        <button 
                          onClick={() => {
                            if (!youtubeUrlInput.trim()) return alert('Cole uma URL do YouTube!');
                            const ytId = youtubeUrlInput.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/)?.[1];
                            if (!ytId) return alert('URL do YouTube inválida!');
                            const exists = videos.find(v => v.id === ytId);
                            if (!exists) {
                              const newVideo: VideoItem = {
                                id: ytId,
                                title: `YouTube: ${ytId}`,
                                duration: '00:05:00',
                                thumbnail: `https://img.youtube.com/vi/${ytId}/mqdefault.jpg`,
                                platform: 'youtube',
                                date: new Date().toLocaleDateString()
                              };
                              setVideos(prev => [newVideo, ...prev]);
                            }
                            setSelectedVideoId(ytId);
                            setYoutubeUrlInput('');
                          }}
                          className="btn-primary" 
                          style={{ padding: '0 12px', fontSize: '12px', whiteSpace: 'nowrap' }}
                        >
                          + Adicionar
                        </button>
                      </div>
                    </div>

                    <div style={{ marginBottom: '15px', padding: '12px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                      <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>💾 Arquivo do Computador:</label>
                      <input
                        type="file"
                        accept="video/*,.mp4,.mkv,.avi,.webm,.mov"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const url = URL.createObjectURL(file);
                          const durationSeconds = await getLocalVideoDuration(url);
                          const newVideo: VideoItem = {
                            id: url,
                            title: file.name.replace(/\.[^/.]+$/, ''),
                            duration: formatTime(Math.round(durationSeconds)),
                            thumbnail: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?auto=format&fit=crop&w=400&q=80',
                            platform: 'local',
                            date: new Date().toLocaleDateString()
                          };
                          setVideos(prev => [newVideo, ...prev]);
                          setSelectedVideoId(newVideo.id);
                          setConnections(prev => ({ ...prev, local: true }));
                          if (e.target) e.target.value = '';
                        }}
                        style={{ width: '100%', backgroundColor: '#000', border: '1px solid #333', padding: '8px', borderRadius: '6px', color: '#fff', fontSize: '12px' }}
                      />
                    </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                      <div>
                        <label>Início:</label>
                        <input type="time" value={selectedTime} onChange={e => setSelectedTime(e.target.value)} />
                      </div>
                      <div>
                        <label>Data:</label>
                        <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} />
                      </div>
                    </div>

                    <label>Fileira / Canal:</label>
                    <select value={selectedChannelId} onChange={e => setSelectedChannelId(e.target.value)} style={{ marginBottom: '20px' }}>
                      {channels.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>

                    <button className="btn-primary" onClick={handleAddProgram} style={{ width: '100%', height: '50px', fontSize: '14px', fontWeight: 'bold' }}>
                      ADICIONAR À GRADE
                    </button>
                 </div>
               </div>

               <div style={{ padding: '24px', flex: 1, overflowY: 'auto' }}>
                 <h4 style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px', fontWeight: 'bold', letterSpacing: '1px' }}>GERENCIAR FILEIRAS</h4>
                 <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                    <input 
                      type="text" 
                      placeholder="Nome da fileira..." 
                      value={newChannelName}
                      onChange={e => setNewChannelName(e.target.value)}
                      style={{ flex: 1, backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', padding: '8px 12px', borderRadius: '6px', color: '#fff' }}
                    />
                    <button onClick={handleAddChannel} className="btn-primary" style={{ padding: '0 15px' }}>+</button>
                 </div>
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {channels.map(c => (
                      <div key={c.id} style={{ padding: '12px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                         <span style={{ fontSize: '13px' }}>{c.name}</span>
                         {channels.length > 1 && (
                           <button onClick={() => setChannels(channels.filter(ch => ch.id !== c.id))} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer' }}>✕</button>
                         )}
                      </div>
                    ))}
                 </div>
               </div>

            </div>
          </div>
        )}

        {activeTab === 'mcr' && (
          <MCRPro 
            videos={videos.map(v => ({ id: v.id, title: v.title, duration: v.duration || '00:05:00', platform: v.platform, radioUrl: v.radioUrl, bannerUrl: v.bannerUrl }))} 
            isStreaming={isStreaming}
            overlayConfig={overlayConfig}
            onUpdateLayer={updateLayer}
            onStartLive={async () => {
              if (!streamKey) return alert('Configure a Chave de Transmissão na aba Conexões antes de começar.');
              try {
                // @ts-ignore
                const ipcRenderer = window.require ? window.require('electron').ipcRenderer : null;
                if (!ipcRenderer) {
                  // Simular modo streaming no navegador para preview local
                  alert('⚡ MODO PREVIEW: A transmissão ao vivo real requer o aplicativo Electron instalado.\n\nNo modo navegador (localhost), você pode usar o MCR Pro em modo preview.\n\nPara transmitir ao vivo, execute: npm run electron');
                  setIsStreaming(true);
                  lastLiveProgramId.current = null;
                  return;
                }

                let finalPath = null;
                let programTitle = 'MCR_PRO';

                if (restreamEnabled && restreamUrl) {
                  finalPath = restreamUrl;
                  if (restreamUrl.includes('youtube.com') || restreamUrl.includes('youtu.be') || restreamUrl.includes('twitch.tv')) {
                    const result = await ipcRenderer.invoke('resolve-youtube-url', { url: restreamUrl });
                    if (result.success) {
                      finalPath = `__ytlive__:${result.url}`;
                    } else {
                      return alert('Erro ao resolver URL da live: ' + result.error);
                    }
                  }
                  programTitle = 'Retransmissão (Restreaming)';
                }

                const result = await ipcRenderer.invoke('start-stream', {
                  videoPath: finalPath,
                  offsetSeconds: 0,
                  rtmpUrl,
                  streamKey: streamKey.trim(),
                  mode: 'video',
                  overlayConfig,
                  programTitle,
                  fallbackUrl: fallbackRadioUrl,
                  fallbackBanner: fallbackBannerUrl,
                  hwAccel
                });
                if (result.success) {
                  setIsStreaming(true);
                  lastLiveProgramId.current = restreamEnabled ? 'restream-active' : null;
                }
              } catch (e) { alert('Erro no Stream: ' + e); }
            }}
            onStopLive={async () => {
              try {
                // @ts-ignore
                const ipcRenderer = window.require ? window.require('electron').ipcRenderer : null;
                if (!ipcRenderer) {
                  setIsStreaming(false);
                  return;
                }
                await ipcRenderer.invoke('stop-stream');
                setIsStreaming(false);
              } catch (e) { alert('Erro ao Parar: ' + e); }
            }}
            onSwitchStream={async (videoPath: string | null, title: string, platform: string, radioUrl?: string, bannerUrl?: string) => {
              if (!isStreaming) return;
              try {
                // @ts-ignore
                const ipcRenderer = window.require ? window.require('electron').ipcRenderer : null;
                if (!ipcRenderer) return;

                // Decide o modo correto baseado na plataforma do vídeo
                let mode = 'video';
                let finalVideoPath = videoPath;

                if (platform === 'webradio') {
                  mode = 'radio';
                  finalVideoPath = '__webradio__';
                } else if (platform === 'youtube' || platform === 'twitch') {
                  // Resolve a URL do YouTube/Twitch via yt-dlp para retransmissão
                  try {
                    // Se o filePath já é uma URL completa, usa direto; senão monta a URL
                    let ytUrl: string;
                    if (videoPath && (videoPath.startsWith('http://') || videoPath.startsWith('https://'))) {
                      ytUrl = videoPath;
                    } else if (platform === 'youtube') {
                      ytUrl = `https://www.youtube.com/watch?v=${videoPath}`;
                    } else {
                      ytUrl = `https://www.twitch.tv/${videoPath}`;
                    }
                    console.log('[MCR] Resolvendo URL via yt-dlp:', ytUrl);
                    const result = await ipcRenderer.invoke('resolve-youtube-url', { url: ytUrl });
                    if (result.success) {
                      finalVideoPath = `__ytlive__:${result.url}`;
                      mode = 'video';
                      console.log('[MCR] URL resolvida com sucesso');
                    } else {
                      console.warn('[MCR] yt-dlp falhou, usando screensaver:', result.error);
                      mode = 'screensaver';
                      finalVideoPath = null;
                    }
                  } catch (ytErr) {
                    console.warn('[MCR] yt-dlp indisponível:', ytErr);
                    mode = 'screensaver';
                    finalVideoPath = null;
                  }
                } else if (platform === 'camera') {
                  finalVideoPath = '__camera__';
                } else if (!videoPath) {
                  mode = 'radio';
                }

                await ipcRenderer.invoke('switch-stream', {
                  videoPath: finalVideoPath,
                  offsetSeconds: 0,
                  overlayConfig,
                  programTitle: title,
                  fallbackUrl: radioUrl || fallbackRadioUrl,
                  fallbackBanner: bannerUrl || fallbackBannerUrl,
                  mode,
                  hwAccel
                });
              } catch (e) { console.error('Erro no switch do MCR:', e); }
            }}
          />
        )}

        {activeTab === 'live' && (
          <div className="fade-in" style={{ flex: 1, backgroundColor: '#050508', display: 'flex', overflow: 'hidden' }}>
            
            {/* Left Column: Player and Master Controls */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border-color)' }}>
              
              <div style={{ flex: 1, position: 'relative', backgroundColor: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {isLive && liveProgram ? (
                  liveProgram.video.platform === 'camera' ? <CameraView key={`camera-${liveProgram.id}`} /> :
                  liveProgram.video.platform === 'webradio' ? <WebRadioView key={`radio-${liveProgram.id}`} radioUrl={liveProgram.video.radioUrl} bannerUrl={liveProgram.video.bannerUrl || fallbackBannerUrl} radioVolume={radioVolume} /> :
                  liveProgram.video.platform === 'youtube' ? <iframe key={`yt-${liveProgram.id}`} src={`https://www.youtube.com/embed/${liveProgram.video.id}${liveProgram.video.id.includes('?') ? '&' : '?'}autoplay=1&mute=1&controls=0&start=${Math.floor(offsetSeconds)}`} style={{ width: '100%', height: '100%', border: 'none' }} allow="autoplay" /> :
                  liveProgram.video.platform === 'twitch' ? <iframe key={`tw-${liveProgram.id}`} src={`https://player.twitch.tv/?channel=${liveProgram.video.id}&parent=localhost&muted=true`} style={{ width: '100%', height: '100%', border: 'none' }} allow="autoplay" /> :
                  <video ref={videoRef} key={`video-${liveProgram.id}`} src={liveProgram.video.id} autoPlay muted style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                ) : (
                  <div style={{ textAlign: 'center', opacity: 0.2 }}>
                    <div style={{ fontSize: '80px', marginBottom: '15px' }}>📺</div>
                    <div style={{ fontSize: '20px', fontWeight: '900', letterSpacing: '4px' }}>ESTAÇÃO_EM_ESPERA</div>
                    <div style={{ fontSize: '10px', marginTop: '10px' }}>AGUARDANDO PROGRAMAÇÃO OU AUTO DJ</div>
                  </div>
                )}

                {/* Overlays on top of the live player */}
                {overlayConfig.enabled && (
                  <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                    {overlayConfig.layers.filter(l => l.enabled).map(layer => {
                       if (layer.type === 'image' && layer.imageUrl) return <img key={layer.id} src={layer.imageUrl} style={{ position:'absolute', left:`${layer.x}%`, top:`${layer.y}%`, width:`${layer.imageWidth}%` }} />;
                       return null;
                    })}
                  </div>
                )}

                <div style={{ position: 'absolute', top: '20px', left: '20px', backgroundColor: isStreaming ? 'var(--accent-danger)' : '#111', color: '#fff', padding: '6px 12px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#fff', animation: isStreaming ? 'pulse 1s infinite' : 'none' }} />
                  {isStreaming ? 'TRANSMISSÃO AO VIVO' : 'SINAL DE PREVIEW'}
                </div>
              </div>

              <div style={{ height: '120px', backgroundColor: 'var(--bg-secondary)', borderTop: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', padding: '0 40px', gap: '40px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 'bold', letterSpacing: '1px' }}>PROGRAMA ATUAL</div>
                  <div style={{ fontSize: '22px', fontWeight: '900', color: isLive ? '#fff' : '#333', letterSpacing: '-0.5px' }}>
                    {isLive ? liveProgram?.video?.title : 'NENHUMA FONTE ATIVA'}
                  </div>
                  {isLive && (
                    <div style={{ marginTop: '8px', display: 'flex', gap: '15px', alignItems: 'center' }}>
                      <div style={{ width: '200px', height: '4px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '2px' }}>
                        <div style={{ height: '100%', backgroundColor: 'var(--accent-primary)', width: `${(offsetSeconds / ((liveProgram?.durationMinutes || 1) * 60)) * 100}%` }} />
                      </div>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                        -{formatTime(Math.max(0, ((liveProgram?.durationMinutes || 0) * 60) - offsetSeconds))}
                      </span>
                    </div>
                  )}
                </div>
                
                <div style={{ display: 'flex', gap: '12px' }}>
                  {!isStreaming ? (
                    <button 
                      className="btn-primary" 
                      onClick={async () => {
                        if (!streamKey) return alert('Configure a Chave de Transmissão.');
                        try {
                          // @ts-ignore
                          const ipcRenderer = window.require ? window.require('electron').ipcRenderer : null;
                          if (!ipcRenderer) {
                            // Simular transmissão no navegador para preview local
                            alert('⚡ MODO PREVIEW: A transmissão ao vivo real requer o aplicativo Electron instalado.\n\nNo modo navegador (localhost), você pode visualizar a grade e o preview normalmente.\n\nPara transmitir, use o aplicativo StreamTV instalado ou execute: npm run electron');
                            return;
                          }
                          const result = await ipcRenderer.invoke('start-stream', {
                            videoPath: liveProgram?.video?.id || null,
                            offsetSeconds: liveProgram?.video?.platform === 'webradio' ? 0 : offsetSeconds,
                            rtmpUrl, streamKey: streamKey.trim(), mode: 'video', overlayConfig, 
                            programTitle: liveProgram?.video?.title || 'MCR', fallbackUrl: fallbackRadioUrl, fallbackBanner: fallbackBannerUrl, hwAccel
                          });
                          if (result.success) setIsStreaming(true);
                        } catch (e) { alert('Erro: ' + e); }
                      }}
                      style={{ height: '54px', padding: '0 30px', fontSize: '14px', backgroundColor: 'var(--accent-danger)', fontWeight: 'bold' }}
                    >
                      ● INICIAR TRANSMISSÃO
                    </button>
                  ) : (
                    <button 
                      className="btn-primary" 
                      onClick={async () => {
                        // @ts-ignore
                        const ipcRenderer = window.require ? window.require('electron').ipcRenderer : null;
                        if (ipcRenderer) await ipcRenderer.invoke('stop-stream');
                        setIsStreaming(false);
                      }}
                      style={{ height: '54px', padding: '0 30px', fontSize: '14px', backgroundColor: '#111', border: '1px solid var(--accent-danger)', color: 'var(--accent-danger)', fontWeight: 'bold' }}
                    >
                      FORA DO AR (PARAR)
                    </button>
                  )}
                  <button 
                    onClick={() => {
                      if (nextProgram && window.confirm('Pular para o próximo programa?')) {
                        handleDeleteProgram(liveProgram!.id);
                      }
                    }}
                    style={{ height: '54px', width: '54px', backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', borderRadius: '12px', cursor: 'pointer', color: '#fff', fontSize: '20px' }}
                  >⏭</button>
                </div>
              </div>
            </div>

            {/* Right Column: Console & EPG */}
            <div style={{ width: '420px', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-secondary)' }}>
              
              <div style={{ padding: '24px', borderBottom: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <h3 style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 'bold', letterSpacing: '1px' }}>ESTADO DO SISTEMA</h3>
                  <div style={{ padding: '4px 10px', backgroundColor: isStreaming ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.05)', color: isStreaming ? 'var(--accent-danger)' : '#555', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold' }}>
                    {isStreaming ? 'ONLINE' : 'OFFLINE'}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                  <div className="glass-panel" style={{ padding: '15px', border: '1px solid rgba(255,255,255,0.03)' }}>
                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '5px' }}>MASTER CLOCK</div>
                    <div style={{ fontSize: '22px', fontWeight: 'bold', fontFamily: 'JetBrains Mono, monospace' }}>
                      {currentTimeTick.toLocaleTimeString('pt-BR', { hour12: false })}
                    </div>
                  </div>
                  <div className="glass-panel" style={{ padding: '15px', border: '1px solid rgba(255,255,255,0.03)' }}>
                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '5px' }}>PRÓXIMA TROCA</div>
                    <div style={{ fontSize: '22px', fontWeight: 'bold', color: 'var(--accent-secondary)', fontFamily: 'JetBrains Mono, monospace' }}>
                      {getNextCountdown()}
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ padding: '12px 24px', fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 'bold', backgroundColor: 'rgba(0,0,0,0.1)', borderBottom: '1px solid var(--border-color)' }}>
                  CONSOLE DE SAÍDA (FFMPEG)
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '20px', fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', color: '#4ade80', backgroundColor: '#000', lineHeight: '1.5' }}>
                  {streamLogs.length === 0 ? (
                    <div style={{ color: '#222', fontStyle: 'italic' }}>Aguardando logs do backend...</div>
                  ) : (
                    streamLogs.map((log, i) => <div key={i} style={{ marginBottom: '4px', opacity: 0.8 }}>{log}</div>)
                  )}
                  <div ref={logEndRef} />
                </div>
                <div style={{ padding: '10px 20px', backgroundColor: '#000', display: 'flex', justifyContent: 'flex-end' }}>
                   <button onClick={() => setStreamLogs([])} style={{ background: 'none', border: 'none', color: '#555', fontSize: '10px', cursor: 'pointer' }}>Limpar Console</button>
                </div>
              </div>

              <div style={{ padding: '24px', backgroundColor: 'var(--bg-primary)', borderTop: '1px solid var(--border-color)' }}>
                <h4 style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '16px', fontWeight: 'bold' }}>PAINEL DE CONTROLE RÁPIDO</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                    <span style={{ fontSize: '13px' }}>Playout Automático</span>
                    <input type="checkbox" checked={autoFallback} onChange={e => setAutoFallback(e.target.checked)} />
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                    <span style={{ fontSize: '13px' }}>Aceleração de Hardware</span>
                    <input type="checkbox" checked={hwAccel} onChange={e => setHwAccel(e.target.checked)} />
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                    <span style={{ fontSize: '13px' }}>Camada de Overlay</span>
                    <input type="checkbox" checked={overlayConfig.enabled} onChange={e => setOverlayConfig(p => ({ ...p, enabled: e.target.checked }))} />
                  </label>
                </div>
              </div>

            </div>

          </div>
        )}
        </ErrorBoundary>
      </main>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="video/*,.mp4,.mkv,.avi,.webm,.mov"
        style={{ display: 'none' }}
        onChange={handleFileInputChange}
      />
    </div>
  );
}

export default App;

