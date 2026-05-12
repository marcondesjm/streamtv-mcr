import React, { useState, useEffect } from 'react';
import type { VideoItem } from './services/api';

interface AutoDJConfig {
  enabled: boolean;
  shuffle: boolean;
  loop: boolean;
  sourceFolders: string[];
  transitionType: 'cut' | 'fade';
  fillerFrequency: number;
  commercialPath: string;
  hourlyAnnouncement: boolean;
  announcementInterval: number; // em minutos
}

interface AutoDJProps {
  videos: VideoItem[];
  onPlayNext: (video: VideoItem) => void;
  currentVideo?: VideoItem;
}

// Demo videos for testing when library is empty
const DEMO_VIDEOS: VideoItem[] = [
  { id: 'demo-1', title: '🎵 Abertura do Programa', duration: '00:05:30', thumbnail: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?auto=format&fit=crop&w=400&q=80', platform: 'local', date: '' },
  { id: 'demo-2', title: '📺 Bloco de Notícias', duration: '00:15:00', thumbnail: 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&w=400&q=80', platform: 'local', date: '' },
  { id: 'demo-3', title: '🎬 Documentário: Natureza', duration: '00:45:00', thumbnail: 'https://images.unsplash.com/photo-1472214103451-9374bd1c798e?auto=format&fit=crop&w=400&q=80', platform: 'local', date: '' },
  { id: 'demo-4', title: '🎤 Show ao Vivo', duration: '01:00:00', thumbnail: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=400&q=80', platform: 'local', date: '' },
  { id: 'demo-5', title: '📻 Programa de Rádio', duration: '00:30:00', thumbnail: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=400&q=80', platform: 'local', date: '' },
  { id: 'demo-6', title: '🌐 Cobertura Especial', duration: '00:20:00', thumbnail: 'https://images.unsplash.com/photo-1461151304267-38231e7f3f40?auto=format&fit=crop&w=400&q=80', platform: 'local', date: '' },
];

const AutoDJ: React.FC<AutoDJProps> = ({ videos, onPlayNext, currentVideo }) => {
  const [config, setConfig] = useState<AutoDJConfig>(() => {
    const saved = localStorage.getItem('autodj-config');
    return saved ? JSON.parse(saved) : {
      enabled: false,
      shuffle: true,
      loop: true,
      sourceFolders: [],
      transitionType: 'fade',
      fillerFrequency: 5,
      commercialPath: '',
      hourlyAnnouncement: true,
      announcementInterval: 60
    };
  });

  const effectiveVideos = videos.length > 0 ? videos : DEMO_VIDEOS;
  const isDemo = videos.length === 0;

  const [queue, setQueue] = useState<VideoItem[]>([]);
  const [history, setHistory] = useState<VideoItem[]>([]);
  const [commercials, setCommercials] = useState<VideoItem[]>([]);
  const [nowPlaying, setNowPlaying] = useState<VideoItem | null>(currentVideo || null);
  const [lastAnnouncementTime, setLastAnnouncementTime] = useState<number>(Date.now());
  const [announcementNotification, setAnnouncementNotification] = useState<string>('');

  useEffect(() => {
    localStorage.setItem('autodj-config', JSON.stringify(config));
  }, [config]);

  // Lógica de anúncio de hora
  useEffect(() => {
    if (!config.enabled || !config.hourlyAnnouncement) return;

    const checkTime = setInterval(() => {
      const now = Date.now();
      const timeSinceLastAnnouncement = now - lastAnnouncementTime;
      const intervalInMs = config.announcementInterval * 60 * 1000;

      if (timeSinceLastAnnouncement >= intervalInMs) {
        const currentTime = new Date();
        const hours = String(currentTime.getHours()).padStart(2, '0');
        const minutes = String(currentTime.getMinutes()).padStart(2, '0');
        const timeString = `${hours}:${minutes}`;

        // Atualizar notificação e reproduzir som
        setAnnouncementNotification(`🔊 SÃO ${timeString}`);
        playHourAnnouncement(timeString);
        setLastAnnouncementTime(now);

        // Remover notificação após 3 segundos
        setTimeout(() => setAnnouncementNotification(''), 3000);
      }
    }, 5000); // Verificar a cada 5 segundos

    return () => clearInterval(checkTime);
  }, [config.enabled, config.hourlyAnnouncement, config.announcementInterval, lastAnnouncementTime]);

  // Função para reproduzir áudio de anúncio de hora
  const playHourAnnouncement = (time: string) => {
    try {
      const utterance = new SpeechSynthesisUtterance(`São ${time.replace(':', ' horas e ')} minutos`);
      utterance.lang = 'pt-BR';
      utterance.rate = 1;
      utterance.pitch = 1;
      speechSynthesis.cancel();
      speechSynthesis.speak(utterance);
    } catch (e) {
      console.error('Erro ao reproduzir anúncio:', e);
    }
  };

  const generateQueue = () => {
    let list = [...effectiveVideos];
    if (config.shuffle) {
      list = list.sort(() => Math.random() - 0.5);
    }
    setQueue(list);
  };

  // Initialize queue on mount or when video list changes
  useEffect(() => {
    generateQueue();
  }, [effectiveVideos.length, config.shuffle]);

  // When Auto DJ is enabled and no current video, start playing
  useEffect(() => {
    if (config.enabled && !nowPlaying && queue.length > 0) {
      const first = queue[0];
      setNowPlaying(first);
      setQueue(prev => prev.slice(1));
      onPlayNext(first);
    }
  }, [config.enabled, queue.length]);

  const handleSelectCommercialFolder = async () => {
    try {
      // @ts-ignore
      const ipcRenderer = window.require ? window.require('electron').ipcRenderer : null;
      if (ipcRenderer) {
        const files = await ipcRenderer.invoke('select-folder');
        if (files && files.length > 0) {
          const commList = files.map((f: any) => ({
            id: f.path,
            title: f.name,
            duration: '00:30',
            thumbnail: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?auto=format&fit=crop&w=400&q=80',
            platform: 'local'
          }));
          setCommercials(commList);
          setConfig(p => ({ ...p, commercialPath: files[0].path.split('/').slice(0, -1).join('/') }));
        }
      } else {
        alert('Função disponível apenas no app Electron instalado. No browser, use a Biblioteca para importar vídeos.');
      }
    } catch (e) { console.error('Erro ao carregar comerciais:', e); }
  };

  const handleSkip = () => {
    if (queue.length > 0) {
      const next = queue[0];
      if (nowPlaying) setHistory(prev => [nowPlaying, ...prev].slice(0, 10));
      setQueue(prev => prev.slice(1));
      setNowPlaying(next);
      onPlayNext(next);
      if (queue.length <= 1) generateQueue();
    } else {
      generateQueue();
    }
  };

  const handleActivate = () => {
    const newEnabled = !config.enabled;
    setConfig(p => ({ ...p, enabled: newEnabled }));
    if (newEnabled && queue.length > 0 && !nowPlaying) {
      const first = queue[0];
      setNowPlaying(first);
      setQueue(prev => prev.slice(1));
      onPlayNext(first);
    }
  };

  const displayVideo = currentVideo || nowPlaying;

  return (
    <div className="fade-in" style={{ padding: '40px', color: '#fff', height: '100%', overflowY: 'auto', backgroundColor: 'var(--bg-primary)' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '32px', fontWeight: '900', letterSpacing: '-1px' }}>
            AUTO DJ <span style={{ color: 'var(--accent-primary)' }}>CENTER</span>
          </h1>
          <p style={{ color: 'var(--text-secondary)', margin: '5px 0 0 0', fontSize: '14px' }}>
            Playout inteligente com automação de intervalos e comerciais.
            {isDemo && <span style={{ color: 'var(--accent-danger)', marginLeft: '10px', fontSize: '11px', fontWeight: 'bold' }}>⚠ MODO DEMONSTRAÇÃO — Importe vídeos na Biblioteca</span>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '15px' }}>
          <div style={{ backgroundColor: 'var(--bg-secondary)', padding: '12px 24px', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '15px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: config.enabled ? 'var(--accent-secondary)' : '#444', animation: config.enabled ? 'pulse 1.5s infinite' : 'none' }} />
              <span style={{ fontSize: '11px', fontWeight: '900', color: config.enabled ? 'var(--accent-secondary)' : 'var(--text-secondary)' }}>
                {config.enabled ? 'SYSTEM_ONLINE' : 'SYSTEM_STANDBY'}
              </span>
            </div>
            <button
              onClick={handleActivate}
              style={{
                backgroundColor: config.enabled ? 'var(--accent-danger)' : 'var(--accent-primary)',
                padding: '10px 24px', borderRadius: '8px', border: 'none', color: '#fff',
                fontWeight: 'bold', cursor: 'pointer', fontSize: '13px', transition: '0.2s'
              }}
            >
              {config.enabled ? '⏹ DESATIVAR PLAYOUT' : '▶ INICIAR AUTO DJ'}
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '30px', alignItems: 'start' }}>

        {/* Left Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>

          {/* Air Monitor */}
          <div className="glass-panel" style={{ padding: '35px', position: 'relative', overflow: 'hidden', borderRadius: '20px' }}>
            <div style={{ position: 'absolute', top: '15px', right: '20px', fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 'bold', letterSpacing: '1px' }}>
              AIR_MONITOR_V1
            </div>
            {displayVideo ? (
              <div style={{ display: 'flex', gap: '30px', alignItems: 'center' }}>
                <div style={{ width: '280px', aspectRatio: '16/9', borderRadius: '12px', overflow: 'hidden', border: '2px solid var(--border-color)', position: 'relative', flexShrink: 0 }}>
                  <img src={displayVideo.thumbnail} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt={displayVideo.title} />
                  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(0deg, rgba(0,0,0,0.6) 0%, transparent 50%)' }} />
                  <div style={{ position: 'absolute', bottom: '10px', left: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ width: '7px', height: '7px', backgroundColor: config.enabled ? 'var(--accent-secondary)' : '#888', borderRadius: '50%', animation: config.enabled ? 'pulse 1.5s infinite' : 'none' }} />
                    <span style={{ fontSize: '9px', fontWeight: '900', color: '#fff' }}>{config.enabled ? 'LIVE_OUTPUT' : 'PREVIEW'}</span>
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                    <div style={{ fontSize: '10px', color: 'var(--accent-primary)', fontWeight: '900', letterSpacing: '2px' }}>EM_EXIBIÇÃO</div>
                    {announcementNotification && (
                      <div style={{ padding: '4px 12px', borderRadius: '6px', backgroundColor: 'rgba(250, 204, 21, 0.2)', color: '#facc15', fontSize: '10px', fontWeight: '900', animation: 'pulse 0.6s infinite', border: '1px solid rgba(250, 204, 21, 0.4)' }}>
                        {announcementNotification}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: '26px', fontWeight: '900', marginBottom: '12px', lineHeight: 1.2 }}>{displayVideo.title}</div>
                  <div style={{ display: 'flex', gap: '20px', color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '20px' }}>
                    <span>🕒 {displayVideo.duration}</span>
                    <span style={{ color: 'var(--accent-secondary)', fontWeight: 'bold' }}>FONTE: {displayVideo.platform.toUpperCase()}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button onClick={handleSkip} style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: '#fff', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>
                      PULAR PARA PRÓXIMO ⏭
                    </button>
                    {isDemo && (
                      <div style={{ padding: '10px 15px', borderRadius: '8px', border: '1px dashed rgba(255,200,0,0.3)', backgroundColor: 'rgba(255,200,0,0.05)', fontSize: '11px', color: '#facc15', display: 'flex', alignItems: 'center' }}>
                        DEMO — sem arquivo real
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '50px', color: 'var(--text-secondary)', border: '2px dashed var(--border-color)', borderRadius: '15px' }}>
                <div style={{ fontSize: '50px', marginBottom: '15px' }}>📻</div>
                <p style={{ margin: 0, fontWeight: 'bold', fontSize: '16px' }}>AGUARDANDO COMANDO DE PLAYOUT</p>
                <p style={{ margin: '8px 0 0 0', fontSize: '13px', color: '#555' }}>Clique em "INICIAR AUTO DJ" para começar.</p>
              </div>
            )}
          </div>

          {/* Config Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div className="glass-panel" style={{ padding: '25px', borderRadius: '16px' }}>
              <h4 style={{ fontSize: '11px', color: 'var(--accent-primary)', marginBottom: '20px', fontWeight: '900', letterSpacing: '1px', margin: '0 0 20px 0' }}>
                REGRAS DE REPRODUÇÃO
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', fontSize: '13px' }}>
                  <input type="checkbox" checked={config.shuffle} onChange={e => setConfig(p => ({ ...p, shuffle: e.target.checked }))} style={{ width: '18px', height: '18px', accentColor: 'var(--accent-primary)' }} />
                  <span>Embaralhar (Shuffle)</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', fontSize: '13px' }}>
                  <input type="checkbox" checked={config.loop} onChange={e => setConfig(p => ({ ...p, loop: e.target.checked }))} style={{ width: '18px', height: '18px', accentColor: 'var(--accent-primary)' }} />
                  <span>Repetir Infinitamente (Loop)</span>
                </label>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>Intervalo de Comerciais</label>
                  <select
                    value={config.fillerFrequency}
                    onChange={e => setConfig(p => ({ ...p, fillerFrequency: Number(e.target.value) }))}
                    style={{ width: '100%', backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: '#fff', padding: '10px', borderRadius: '8px', outline: 'none' }}
                  >
                    <option value={0}>Desativado</option>
                    <option value={1}>A cada 1 vídeo</option>
                    <option value={3}>A cada 3 vídeos</option>
                    <option value={5}>A cada 5 vídeos</option>
                    <option value={10}>A cada 10 vídeos</option>
                  </select>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', fontSize: '13px' }}>
                  <input type="checkbox" checked={config.hourlyAnnouncement} onChange={e => setConfig(p => ({ ...p, hourlyAnnouncement: e.target.checked }))} style={{ width: '18px', height: '18px', accentColor: 'var(--accent-primary)' }} />
                  <span>🔊 Avisar a Hora</span>
                </label>
                {config.hourlyAnnouncement && (
                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>Intervalo de Aviso</label>
                    <select
                      value={config.announcementInterval}
                      onChange={e => setConfig(p => ({ ...p, announcementInterval: Number(e.target.value) }))}
                      style={{ width: '100%', backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: '#fff', padding: '10px', borderRadius: '8px', outline: 'none' }}
                    >
                      <option value={15}>A cada 15 min</option>
                      <option value={30}>A cada 30 min</option>
                      <option value={60}>A cada 1 hora</option>
                      <option value={120}>A cada 2 horas</option>
                      <option value={360}>A cada 6 horas</option>
                    </select>
                    <button 
                      onClick={() => {
                        const currentTime = new Date();
                        const hours = String(currentTime.getHours()).padStart(2, '0');
                        const minutes = String(currentTime.getMinutes()).padStart(2, '0');
                        const timeString = `${hours}:${minutes}`;
                        setAnnouncementNotification(`🔊 SÃO ${timeString}`);
                        playHourAnnouncement(timeString);
                        setTimeout(() => setAnnouncementNotification(''), 3000);
                      }}
                      style={{ marginTop: '10px', width: '100%', backgroundColor: 'var(--accent-primary)', border: 'none', color: '#fff', padding: '8px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '11px' }}
                    >
                      🔊 TESTAR AVISO
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="glass-panel" style={{ padding: '25px', borderRadius: '16px' }}>
              <h4 style={{ fontSize: '11px', color: 'var(--accent-primary)', marginBottom: '20px', fontWeight: '900', letterSpacing: '1px', margin: '0 0 20px 0' }}>
                CONTEÚDO PUBLICITÁRIO
              </h4>
              {commercials.length > 0 ? (
                <div>
                  <div style={{ fontSize: '36px', fontWeight: '900', color: 'var(--accent-secondary)' }}>
                    {commercials.length} <span style={{ fontSize: '14px', color: 'var(--text-secondary)', fontWeight: '400' }}>ATIVOS</span>
                  </div>
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: '8px 0 20px 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{config.commercialPath}</p>
                  <button onClick={handleSelectCommercialFolder} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent', color: '#fff', cursor: 'pointer', fontWeight: 'bold' }}>Trocar Pasta</button>
                </div>
              ) : (
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '20px', lineHeight: 1.5 }}>Configure uma pasta para inserção automática de comerciais nos intervalos.</p>
                  <button onClick={handleSelectCommercialFolder} className="btn-primary" style={{ width: '100%', padding: '12px', fontWeight: 'bold' }}>Selecionar Pasta</button>
                </div>
              )}
            </div>
          </div>

          {/* Library Grid */}
          <div className="glass-panel" style={{ padding: '25px', borderRadius: '16px' }}>
            <h4 style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 'bold', letterSpacing: '1px', margin: '0 0 20px 0' }}>
              BANCO DE DADOS — {effectiveVideos.length} VÍDEO{effectiveVideos.length !== 1 ? 'S' : ''} {isDemo ? '(DEMO)' : ''}
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '15px' }}>
              {effectiveVideos.slice(0, 12).map(v => (
                <div key={v.id} style={{ backgroundColor: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                  <img src={v.thumbnail} style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', borderRadius: '6px', marginBottom: '8px' }} alt={v.title} />
                  <div style={{ fontSize: '12px', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.title}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '4px' }}>{v.duration}</div>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Right Column: Queue & History */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>

          {/* Queue */}
          <div className="glass-panel" style={{ borderRadius: '20px', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '500px' }}>
            <div style={{ padding: '18px 20px', backgroundColor: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: '900', letterSpacing: '1px' }}>PRÓXIMOS_EM_LINHA</span>
              <button onClick={generateQueue} style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>↺ REGERAR</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
              {queue.length === 0 && (
                <div style={{ textAlign: 'center', padding: '30px', color: '#444', fontSize: '12px' }}>
                  Fila vazia. Clique em REGERAR.
                </div>
              )}
              {queue.slice(0, 20).map((v, i) => (
                <div key={`${v.id}-${i}`} style={{
                  display: 'flex', gap: '12px', padding: '10px', borderRadius: '10px', alignItems: 'center',
                  marginBottom: '6px',
                  backgroundColor: i === 0 ? 'rgba(100,108,255,0.1)' : 'transparent',
                  border: i === 0 ? '1px solid rgba(100,108,255,0.25)' : '1px solid transparent'
                }}>
                  <span style={{ fontSize: '11px', color: i === 0 ? 'var(--accent-primary)' : '#444', fontWeight: 'bold', width: '22px', flexShrink: 0 }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <img src={v.thumbnail} style={{ width: '60px', aspectRatio: '16/9', objectFit: 'cover', borderRadius: '5px', flexShrink: 0 }} alt="" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '12px', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: i === 0 ? '#fff' : '#bbb' }}>{v.title}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '2px' }}>{v.duration}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* History */}
          <div className="glass-panel" style={{ borderRadius: '20px', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '300px' }}>
            <div style={{ padding: '15px 20px', borderBottom: '1px solid var(--border-color)', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 'bold', letterSpacing: '1px' }}>
              HISTÓRICO_LOG
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '15px' }}>
              {history.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#333', fontSize: '12px', marginTop: '20px' }}>Nenhum item no histórico.</p>
              ) : (
                history.map((v, i) => (
                  <div key={`${v.id}-h-${i}`} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', opacity: 0.5 }}>
                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--accent-secondary)', flexShrink: 0 }} />
                    <div style={{ fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{v.title}</div>
                    <span style={{ fontSize: '10px', color: 'var(--accent-secondary)', flexShrink: 0 }}>✓</span>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default AutoDJ;
