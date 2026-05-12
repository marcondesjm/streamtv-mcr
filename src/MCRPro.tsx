import React, { useState, useEffect, useRef } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface PlaylistEvent {
  id: string;
  title: string;
  duration: number; // seconds
  filePath: string;
  platform: 'local' | 'youtube' | 'twitch' | 'camera' | 'webradio';
  type: 'video' | 'graphic' | 'gpi' | 'break';
  startTime?: string; // HH:MM:SS absolute
  color: string;
  restriction?: 'none' | 'alcohol' | 'tobacco' | 'adult';
  expiryDate?: string;
  loop?: boolean;
  status: 'waiting' | 'cued' | 'playing' | 'done' | 'expired';
  radioUrl?: string;
  bannerUrl?: string;
}

export interface PlaylistChannel {
  id: string;
  name: string;
  events: PlaylistEvent[];
  isActive: boolean;
  currentIndex: number;
  loopEnabled: boolean;
  prerollMs: number;
  volume: number; // 0-100
  vuLevels: [number, number]; // L/R 0-1
}

// ─── i18n ─────────────────────────────────────────────────────────────────────
const i18n: Record<string, Record<string, string>> = {
  'pt-BR': {
    title: 'MCR PRO — Automação de Broadcast',
    channels: 'CANAIS', addChannel: '+ Canal', removeChannel: 'Remover',
    loop: 'LOOP', preroll: 'Preroll', volume: 'Volume',
    play: '▶ PLAY', stop: '■ STOP', next: '⏭ PRÓX', prev: '⏮ ANT',
    overflow: 'ESTOURO', gap: 'BURACO', total: 'TOTAL',
    commercialTimer: 'Comercial', breakTimer: 'Break', blockTimer: 'Bloco',
    eventTimer: 'Evento', lang: 'Idioma', settings: 'Config',
    noEvents: 'Nenhum evento. Arraste vídeos aqui.',
    expired: 'VENCIDO', restricted: 'RESTRITO', live: 'AO VIVO',
    waiting: 'AGUARDA', playing: 'EXIBINDO', done: 'EXIBIDO',
    dragHint: 'Arraste eventos entre canais',
    preview: 'PREVIEW', pgm: 'PROGRAMA',
    addEvent: '+ Evento', clearDone: 'Limpar Exibidos',
  },
  'en': {
    title: 'MCR PRO — Broadcast Automation',
    channels: 'CHANNELS', addChannel: '+ Channel', removeChannel: 'Remove',
    loop: 'LOOP', preroll: 'Preroll', volume: 'Volume',
    play: '▶ PLAY', stop: '■ STOP', next: '⏭ NEXT', prev: '⏮ PREV',
    overflow: 'OVERFLOW', gap: 'GAP', total: 'TOTAL',
    commercialTimer: 'Commercial', breakTimer: 'Break', blockTimer: 'Block',
    eventTimer: 'Event', lang: 'Language', settings: 'Settings',
    noEvents: 'No events. Drag videos here.',
    expired: 'EXPIRED', restricted: 'RESTRICTED', live: 'ON AIR',
    waiting: 'WAITING', playing: 'ON AIR', done: 'DONE',
    dragHint: 'Drag events between channels',
    preview: 'PREVIEW', pgm: 'PROGRAM',
    addEvent: '+ Event', clearDone: 'Clear Done',
  },
  'es': {
    title: 'MCR PRO — Automatización de Broadcast',
    channels: 'CANALES', addChannel: '+ Canal', removeChannel: 'Eliminar',
    loop: 'LOOP', preroll: 'Preroll', volume: 'Volumen',
    play: '▶ REPRODUCIR', stop: '■ PARAR', next: '⏭ SIG', prev: '⏮ ANT',
    overflow: 'EXCESO', gap: 'HUECO', total: 'TOTAL',
    commercialTimer: 'Comercial', breakTimer: 'Break', blockTimer: 'Bloque',
    eventTimer: 'Evento', lang: 'Idioma', settings: 'Config',
    noEvents: 'Sin eventos. Arrastre videos aquí.',
    expired: 'VENCIDO', restricted: 'RESTRINGIDO', live: 'EN VIVO',
    waiting: 'ESPERANDO', playing: 'EN VIVO', done: 'TERMINADO',
    dragHint: 'Arrastre eventos entre canales',
    preview: 'PREVIO', pgm: 'PROGRAMA',
    addEvent: '+ Evento', clearDone: 'Limpiar Terminados',
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtSec = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h > 0
    ? `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
    : `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
};

const EVENT_COLORS = ['#646cff','#4ade80','#facc15','#f97316','#ec4899','#06b6d4','#a78bfa','#34d399'];

// ─── VU Meter ─────────────────────────────────────────────────────────────────
const VUMeter: React.FC<{ levels: [number,number]; isActive: boolean }> = ({ levels, isActive }) => (
  <div style={{ display:'flex', gap:'2px', height:'40px', alignItems:'flex-end' }}>
    {levels.map((lv, i) => (
      <div key={i} style={{ width:'10px', display:'flex', flexDirection:'column-reverse', gap:'1px', height:'100%' }}>
        {Array.from({length:10}).map((_,j) => {
          const threshold = j / 10;
          let bg = '#1a1a1a';
          if (isActive && threshold < lv) {
            if (threshold > 0.85) bg = '#ef4444';
            else if (threshold > 0.65) bg = '#facc15';
            else bg = '#4ade80';
          }
          return <div key={j} style={{ flex:1, backgroundColor: bg, borderRadius:'1px' }} />;
        })}
      </div>
    ))}
  </div>
);

// ─── Timer Display ────────────────────────────────────────────────────────────
const TimerBox: React.FC<{ 
  label: string; seconds: number; color: string; 
  isActive: boolean; onToggle: () => void; onReset: () => void 
}> = ({ label, seconds, color, isActive, onToggle, onReset }) => (
  <div style={{ textAlign:'center', padding:'4px 8px', backgroundColor:'#0a0a0f', border:`1px solid ${color}`, borderRadius:'3px', minWidth:'100px', position: 'relative' }}>
    <div style={{ fontSize:'8px', color, marginBottom:'2px', letterSpacing:'1px', fontWeight: 'bold' }}>{label}</div>
    <div style={{ fontSize:'18px', color: isActive ? '#fff' : '#444', fontFamily:'monospace', letterSpacing:'2px' }}>{fmtSec(seconds)}</div>
    <div style={{ display: 'flex', gap: '5px', justifyContent: 'center', marginTop: '4px' }}>
      <button onClick={onToggle} style={{ background: isActive ? '#ef4444' : '#4ade80', border: 'none', borderRadius: '2px', color: '#000', fontSize: '9px', padding: '1px 6px', cursor: 'pointer', fontWeight: 'bold' }}>
        {isActive ? 'STOP' : 'START'}
      </button>
      <button onClick={onReset} style={{ background: '#333', border: 'none', borderRadius: '2px', color: '#fff', fontSize: '9px', padding: '1px 6px', cursor: 'pointer' }}>
        ↺
      </button>
    </div>
  </div>
);

// ─── Event Row ────────────────────────────────────────────────────────────────
const EventRow: React.FC<{
  event: PlaylistEvent; index: number; isNow: boolean; isNext: boolean;
  t: Record<string,string>;
  onDragStart: (e: React.DragEvent, idx: number) => void;
  onDrop: (e: React.DragEvent, idx: number) => void;
  onDelete: (id: string) => void;
  now: Date;
}> = ({ event, index, isNow, isNext, t, onDragStart, onDrop, onDelete, now }) => {
  const isExpired = event.expiryDate ? new Date(event.expiryDate) < now : false;
  const bg = isNow ? 'rgba(239,68,68,0.15)' : isNext ? 'rgba(100,108,255,0.1)' : 'transparent';
  const statusColor = isNow ? '#ef4444' : isNext ? '#646cff' : event.status === 'done' ? '#374151' : '#6b7280';

  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, index)}
      onDragOver={e => e.preventDefault()}
      onDrop={e => onDrop(e, index)}
      style={{
        display:'flex', alignItems:'center', gap:'6px', padding:'5px 8px',
        backgroundColor: bg, borderBottom:'1px solid #1a1a24',
        cursor:'grab', opacity: event.status === 'done' ? 0.45 : 1,
        borderLeft: `3px solid ${isNow ? '#ef4444' : isNext ? '#646cff' : event.color}`,
      }}
    >
      <div style={{ fontSize:'10px', color:'#444', width:'16px', textAlign:'center' }}>{index+1}</div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:'11px', color: isExpired ? '#ef4444' : isNow ? '#fff' : '#ccc', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          {isExpired && <span style={{ color:'#ef4444', marginRight:'4px' }}>⚠</span>}
          {event.restriction !== 'none' && event.restriction && <span style={{ color:'#f97316', marginRight:'4px' }}>🔒</span>}
          {event.title}
        </div>
        <div style={{ fontSize:'9px', color:'#555', display:'flex', gap:'6px' }}>
          <span>{fmtSec(event.duration)}</span>
          {event.startTime && <span style={{ color:'#facc15' }}>@{event.startTime}</span>}
          {event.loop && <span style={{ color:'#4ade80' }}>LOOP</span>}
        </div>
      </div>
      <div style={{ fontSize:'9px', color: statusColor, fontWeight:'bold', minWidth:'46px', textAlign:'center' }}>
        {isNow ? t.playing : isNext ? 'NEXT' : event.status === 'done' ? t.done : t.waiting}
      </div>
      <button
        onClick={() => onDelete(event.id)}
        style={{ background:'none', border:'none', color:'#374151', cursor:'pointer', fontSize:'12px', padding:'2px 4px' }}
      >✕</button>
    </div>
  );
};

// ─── Single Channel Panel ─────────────────────────────────────────────────────
const ChannelPanel: React.FC<{
  channel: PlaylistChannel;
  t: Record<string,string>;
  now: Date;
  onUpdate: (ch: PlaylistChannel) => void;
  onRemove: () => void;
  onPlayEvent: (event: PlaylistEvent | null) => void;
  videos: { id: string; title: string; duration: string; platform?: string; radioUrl?: string; bannerUrl?: string }[];
  isOnAir?: boolean;
}> = ({ channel, t, now, onUpdate, onRemove, onPlayEvent, videos, isOnAir }) => {
  const [dragIdx, setDragIdx] = useState<number|null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [customUrl, setCustomUrl] = useState('');

  // calculate total / overflow / gap
  const totalSecs = channel.events.reduce((s, e) => s + e.duration, 0);
  const targetSecs = 3600; // 1h target block default
  const diff = totalSecs - targetSecs;

  useEffect(() => {
    if (!channel.isActive) { setElapsed(0); return; }
    const t2 = setInterval(() => setElapsed(p => p + 1), 1000);
    return () => clearInterval(t2);
  }, [channel.isActive]);

  const currentEvent = channel.events[channel.currentIndex] || null;
  const nextEvent = channel.events[channel.currentIndex + 1] || null;
  const remaining = currentEvent ? Math.max(0, currentEvent.duration - elapsed) : 0;

  // Lógica de Auto-Advance
  useEffect(() => {
    if (channel.isActive && currentEvent && elapsed >= currentEvent.duration && currentEvent.duration > 0) {
      const evs = [...channel.events];
      evs[channel.currentIndex] = { ...evs[channel.currentIndex], status: 'done' };
      
      let nextIdx = channel.currentIndex + 1;
      if (nextIdx >= evs.length) {
        if (channel.loopEnabled) {
          nextIdx = 0;
          evs.forEach(e => e.status = 'waiting');
        } else {
          onUpdate({ ...channel, events: evs, isActive: false });
          onPlayEvent(null);
          return;
        }
      }
      setElapsed(0);
      onUpdate({ ...channel, events: evs, currentIndex: nextIdx });
      onPlayEvent(evs[nextIdx]);
    }
  }, [elapsed, channel, currentEvent, onUpdate, onPlayEvent]);

  const handleDragStart = (_: React.DragEvent, idx: number) => setDragIdx(idx);
  const handleDrop = (_: React.DragEvent, toIdx: number) => {
    if (dragIdx === null || dragIdx === toIdx) return;
    const evs = [...channel.events];
    const [moved] = evs.splice(dragIdx, 1);
    evs.splice(toIdx, 0, moved);
    setDragIdx(null);
    onUpdate({ ...channel, events: evs });
  };
  const handleDelete = (id: string) => onUpdate({ ...channel, events: channel.events.filter(e => e.id !== id) });

  const addRandomVideo = () => {
    let plat: PlaylistEvent['platform'] = 'local';
    let vidId = '';
    let title = '';
    let secs = 300;
    let rUrl: string | undefined;
    let bUrl: string | undefined;
    
    const input = customUrl.trim();
    if (input && (input.includes('youtu') || input.includes('twitch.tv'))) {
      // Link do YouTube ou Twitch colado pelo usuário
      vidId = input;
      plat = input.includes('twitch.tv') ? 'twitch' : 'youtube';
      title = plat === 'youtube' ? '🔴 YouTube Live' : '🟣 Twitch Stream';
      secs = 3600 * 4; // 4 horas default para lives
    } else if (input && (input.startsWith('http://') || input.startsWith('https://'))) {
      // Qualquer URL de stream (rádio, HLS, etc)
      vidId = input;
      plat = 'webradio';
      title = '📻 Web Stream';
      secs = 3600 * 4;
    } else if (videos.length > 0) {
      // Vídeo aleatório da biblioteca
      const v = videos[Math.floor(Math.random() * videos.length)];
      const parts = (v.duration || '00:01:00').split(':').map(Number);
      secs = parts.length === 3 ? parts[0]*3600+parts[1]*60+parts[2] : parts[0]*60+(parts[1]||0);
      plat = (v.platform || 'local') as PlaylistEvent['platform'];
      vidId = v.id;
      title = v.title;
      rUrl = v.radioUrl;
      bUrl = v.bannerUrl;
    } else {
      // Sem vídeos na biblioteca e sem URL — cria um placeholder de teste
      vidId = '';
      plat = 'local';
      title = '📺 Evento de Teste (Screensaver)';
      secs = 300;
    }

    const newEv: PlaylistEvent = {
      id: Date.now().toString(), title, duration: secs || 300,
      filePath: vidId, platform: plat, type: 'video', color: EVENT_COLORS[channel.events.length % EVENT_COLORS.length],
      status: 'waiting', restriction: 'none',
      radioUrl: rUrl, bannerUrl: bUrl,
    };
    onUpdate({ ...channel, events: [...channel.events, newEv] });
    setCustomUrl('');
  };

  const clearDone = () => onUpdate({ ...channel, events: channel.events.filter(e => e.status !== 'done') });

  const togglePlay = () => {
    setElapsed(0);
    const newActive = !channel.isActive;
    onUpdate({ ...channel, isActive: newActive });
    if (newActive) {
      onPlayEvent(currentEvent);
    } else {
      onPlayEvent(null);
    }
  };

  const formatRemaining = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    if (h > 0) return `-${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `-${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', backgroundColor:'#0e0e18', border: isOnAir ? '2px solid #ef4444' : '1px solid #1e1e2e', borderRadius:'4px', minWidth:'220px', flex:1, overflow:'hidden', boxShadow: isOnAir ? '0 0 15px rgba(239,68,68,0.3)' : 'none', transition:'0.3s' }}>
      {/* Channel Header */}
      <div style={{ padding:'6px 8px', backgroundColor: isOnAir ? '#ef4444' : '#14141f', borderBottom:'1px solid #1e1e2e', display:'flex', alignItems:'center', gap:'6px' }}>
        <div style={{ width:'8px', height:'8px', borderRadius:'50%', backgroundColor: isOnAir ? '#fff' : channel.isActive ? '#ef4444' : '#374151', flexShrink:0 }} />
        <span style={{ fontWeight:'bold', color: isOnAir ? '#fff' : '#fff', fontSize:'12px', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{channel.name}</span>
        {isOnAir && <span style={{ backgroundColor:'#fff', color:'#ef4444', fontSize:'9px', padding:'2px 4px', borderRadius:'2px', fontWeight:'900' }}>ON AIR</span>}
        <VUMeter levels={channel.vuLevels} isActive={channel.isActive} />
        <button onClick={onRemove} style={{ background:'none', border:'none', color: isOnAir ? '#fff' : '#4b5563', cursor:'pointer', fontSize:'11px' }}>✕</button>
      </div>

      {/* Mini Preview */}
      <div style={{ height:'200px', backgroundColor:'#000', position:'relative', display:'flex', alignItems:'center', justifyContent:'center', borderBottom:'1px solid #1e1e2e' }}>
        {channel.isActive && currentEvent ? (
          <>
            {(() => {
              const url = currentEvent.filePath || '';
              let ytId = '';
              if (url.includes('youtu.be/')) ytId = url.split('youtu.be/')[1].split('?')[0];
              else if (url.includes('v=')) ytId = url.split('v=')[1].split('&')[0];
              
              let twCh = '';
              if (url.includes('twitch.tv/')) twCh = url.split('twitch.tv/')[1].split('?')[0];

              if (ytId) return <iframe src={`https://www.youtube.com/embed/${ytId}?autoplay=1&mute=1&controls=0`} style={{ width:'100%', height:'100%', border:'none', pointerEvents:'none', opacity:0.8 }} allow="autoplay" />;
              if (twCh) return <iframe src={`https://player.twitch.tv/?channel=${twCh}&parent=localhost&muted=true`} style={{ width:'100%', height:'100%', border:'none', pointerEvents:'none', opacity:0.8 }} allow="autoplay" />;
              return <video src={url} autoPlay muted loop style={{ width:'100%', height:'100%', objectFit:'contain', opacity:0.8 }} />;
            })()}
            {/* Countdown Timer overlay */}
            <div style={{ position:'absolute', bottom:'10px', right:'10px', backgroundColor:'rgba(0,0,0,0.7)', color: remaining <= 10 ? '#ef4444' : '#fff', padding:'4px 8px', borderRadius:'4px', fontSize:'24px', fontWeight:'bold', textShadow:'0 2px 4px rgba(0,0,0,0.8)', border: remaining <= 10 ? '1px solid #ef4444' : '1px solid transparent', transition:'0.2s' }}>
              {formatRemaining(remaining)}
            </div>
          </>
        ) : (
          <span key="empty" style={{ color:'#1a1a24', fontSize:'24px' }}>📺</span>
        )}
        <div style={{ position:'absolute', top:'4px', left:'4px', backgroundColor: channel.isActive ? '#ef4444' : '#1f2937', color:'#fff', fontSize:'8px', padding:'2px 5px', borderRadius:'2px', fontWeight:'bold' }}>
          {channel.isActive ? '● LIVE' : t.preview}
        </div>
        {channel.isActive && currentEvent && (
          <div style={{ position:'absolute', bottom:'4px', right:'4px', backgroundColor:'rgba(0,0,0,0.8)', color:'#facc15', fontSize:'9px', padding:'2px 5px', borderRadius:'2px', fontFamily:'monospace' }}>
            {fmtSec(remaining)}
          </div>
        )}
        {nextEvent && (
          <div style={{ position:'absolute', bottom:'4px', left:'4px', backgroundColor:'rgba(0,0,0,0.7)', color:'#4ade80', fontSize:'8px', padding:'2px 5px', borderRadius:'2px', maxWidth:'60%', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            PRÓX: {nextEvent.title}
          </div>
        )}
      </div>

      {/* Controls */}
      <div style={{ display:'flex', gap:'4px', padding:'5px 6px', borderBottom:'1px solid #1e1e2e', backgroundColor:'#0a0a14' }}>
        <button onClick={togglePlay} style={{ flex:1, backgroundColor: channel.isActive ? '#374151' : '#646cff', color:'#fff', border:'none', borderRadius:'2px', padding:'4px', fontSize:'10px', cursor:'pointer', fontWeight:'bold' }}>
          {channel.isActive ? t.stop : t.play}
        </button>
        <button onClick={() => onUpdate({ ...channel, currentIndex: Math.max(0, channel.currentIndex - 1) })}
          style={{ backgroundColor:'#1f2937', color:'#fff', border:'none', borderRadius:'2px', padding:'4px 6px', fontSize:'10px', cursor:'pointer' }}>{t.prev}</button>
        <button onClick={() => { setElapsed(0); const next = Math.min(channel.events.length-1, channel.currentIndex+1); onUpdate({ ...channel, currentIndex: next }); if(channel.isActive) onPlayEvent(channel.events[next]); }}
          style={{ backgroundColor:'#1f2937', color:'#fff', border:'none', borderRadius:'2px', padding:'4px 6px', fontSize:'10px', cursor:'pointer' }}>{t.next}</button>
        <button
          onClick={() => onUpdate({ ...channel, loopEnabled: !channel.loopEnabled })}
          style={{ backgroundColor: channel.loopEnabled ? '#065f46' : '#1f2937', color: channel.loopEnabled ? '#4ade80' : '#6b7280', border:'none', borderRadius:'2px', padding:'4px 5px', fontSize:'10px', cursor:'pointer' }}
        >↺</button>
      </div>

      {/* Overflow / Gap indicator */}
      <div style={{ display:'flex', gap:'4px', padding:'3px 6px', backgroundColor:'#06060a', borderBottom:'1px solid #1e1e2e', fontSize:'9px' }}>
        <span style={{ color:'#6b7280' }}>{t.total}: <b style={{ color:'#fff' }}>{fmtSec(totalSecs)}</b></span>
        <span style={{ marginLeft:'auto', color: diff > 0 ? '#ef4444' : diff < 0 ? '#facc15' : '#4ade80', fontWeight:'bold' }}>
          {diff > 0 ? `+${fmtSec(diff)} ${t.overflow}` : diff < 0 ? `-${fmtSec(Math.abs(diff))} ${t.gap}` : '✓ OK'}
        </span>
      </div>

      {/* Event List */}
      <div style={{ flex:1, overflowY:'auto' }}>
        {channel.events.length === 0 ? (
          <div style={{ padding:'20px', textAlign:'center', color:'#374151', fontSize:'11px' }}>{t.noEvents}</div>
        ) : channel.events.map((ev, idx) => (
          <EventRow
            key={ev.id} event={ev} index={idx}
            isNow={channel.isActive && idx === channel.currentIndex}
            isNext={idx === channel.currentIndex + 1}
            t={t} now={now}
            onDragStart={handleDragStart} onDrop={handleDrop} onDelete={handleDelete}
          />
        ))}
      </div>

      {/* Footer */}
      <div style={{ display:'flex', gap:'4px', padding:'5px 6px', borderTop:'1px solid #1e1e2e', backgroundColor:'#0a0a14' }}>
        <input 
          type="text" 
          value={customUrl}
          onChange={e => setCustomUrl(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') addRandomVideo();
          }}
          placeholder="URL do YouTube ou vazio..." 
          style={{ width:'110px', backgroundColor:'#1f2937', color:'#fff', border:'1px solid #374151', borderRadius:'2px', padding:'3px', fontSize:'9px', outline:'none' }}
        />
        <button onClick={addRandomVideo} style={{ flex:1, backgroundColor:'#1f2937', color:'#9ca3af', border:'1px dashed #374151', borderRadius:'2px', padding:'3px', fontSize:'9px', cursor:'pointer' }}>
          {t.addEvent}
        </button>
        <button onClick={clearDone} style={{ backgroundColor:'#1f2937', color:'#6b7280', border:'none', borderRadius:'2px', padding:'3px 6px', fontSize:'9px', cursor:'pointer' }}>
          {t.clearDone}
        </button>
      </div>
    </div>
  );
};

// ─── MCR Pro Main ─────────────────────────────────────────────────────────────
interface MCRProProps {
  videos: { id: string; title: string; duration: string; platform?: string; radioUrl?: string; bannerUrl?: string }[];
  isStreaming?: boolean;
  overlayConfig?: any;
  onUpdateLayer?: (id: string, updates: any) => void;
  onStartLive?: () => void;
  onStopLive?: () => void;
  onSwitchStream?: (videoPath: string | null, title: string, platform: string, radioUrl?: string, bannerUrl?: string) => void;
}

const MCRPro: React.FC<MCRProProps> = ({ videos, isStreaming, overlayConfig, onUpdateLayer, onStartLive, onStopLive, onSwitchStream }) => {
  const [lang, setLang] = useState<'pt-BR'|'en'|'es'>('pt-BR');
  const t = i18n[lang];
  const [now, setNow] = useState(new Date());

  const [onAirChannelId, setOnAirChannelId] = useState<string | null>(null);
  const [commercialTimer, setCommercialTimer] = useState(0);
  const [commercialActive, setCommercialActive] = useState(false);
  const [breakTimer, setBreakTimer] = useState(0);
  const [breakActive, setBreakActive] = useState(false);
  const [blockTimer, setBlockTimer] = useState(0);
  const [blockActive, setBlockActive] = useState(false);

  // Refs para evitar stale closure dentro do setInterval
  const commercialActiveRef = useRef(false);
  const breakActiveRef = useRef(false);
  const blockActiveRef = useRef(false);
  useEffect(() => { commercialActiveRef.current = commercialActive; }, [commercialActive]);
  useEffect(() => { breakActiveRef.current = breakActive; }, [breakActive]);
  useEffect(() => { blockActiveRef.current = blockActive; }, [blockActive]);

  const [channels, setChannels] = useState<PlaylistChannel[]>([
    { id:'ch1', name:'Canal 1 — Principal', events:[], isActive:false, currentIndex:0, loopEnabled:false, prerollMs:250, volume:100, vuLevels:[0,0] },
    { id:'ch2', name:'Canal 2 — Comerciais', events:[], isActive:false, currentIndex:0, loopEnabled:true, prerollMs:250, volume:100, vuLevels:[0,0] },
  ]);

  // Tick clocks and VU meters — usa refs para ler estado atual sem stale closure
  useEffect(() => {
    const iv = setInterval(() => {
      setNow(new Date());
      if (commercialActiveRef.current) setCommercialTimer(p => p + 1);
      if (breakActiveRef.current) setBreakTimer(p => p + 1);
      if (blockActiveRef.current) setBlockTimer(p => p + 1);
      // Animate VU for active channels
      setChannels(prev => prev.map(ch => ch.isActive
        ? { ...ch, vuLevels: [Math.random() * 0.85 + 0.05, Math.random() * 0.85 + 0.05] as [number,number] }
        : { ...ch, vuLevels: [0,0] as [number,number] }
      ));
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  const addChannel = () => {
    if (channels.length >= 8) return;
    const n = channels.length + 1;
    setChannels(p => [...p, {
      id: `ch${Date.now()}`, name: `Canal ${n}`, events: [], isActive: false,
      currentIndex: 0, loopEnabled: false, prerollMs: 250, volume: 100, vuLevels: [0, 0]
    }]);
  };

  const updateChannel = (id: string, data: PlaylistChannel) =>
    setChannels(p => p.map(c => c.id === id ? data : c));

  const removeChannel = (id: string) =>
    setChannels(p => p.filter(c => c.id !== id));

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', backgroundColor:'#06060a', color:'#fff', fontFamily:'monospace', overflow:'hidden' }}>
      {/* Master Toolbar */}
      <div style={{ display:'flex', alignItems:'center', gap:'12px', padding:'8px 16px', backgroundColor:'#0e0e18', borderBottom:'1px solid #1e1e2e', flexShrink:0 }}>
        <span style={{ fontSize:'14px', fontWeight:'900', color:'#646cff', letterSpacing:'2px' }}>MCR_PRO</span>
        <span style={{ fontSize:'20px', color:'#fff', fontFamily:'monospace', letterSpacing:'2px' }}>{now.toLocaleTimeString('pt-BR',{hour12:false})}</span>
        <div style={{ width:'1px', height:'30px', backgroundColor:'#1e1e2e' }} />
        {/* Timers */}
        <TimerBox 
          label={t.commercialTimer} seconds={commercialTimer} color="#646cff" 
          isActive={commercialActive} onToggle={() => setCommercialActive(!commercialActive)} onReset={() => setCommercialTimer(0)} 
        />
        <TimerBox 
          label={t.breakTimer} seconds={breakTimer} color="#facc15" 
          isActive={breakActive} onToggle={() => setBreakActive(!breakActive)} onReset={() => setBreakTimer(0)} 
        />
        <TimerBox 
          label={t.blockTimer} seconds={blockTimer} color="#4ade80" 
          isActive={blockActive} onToggle={() => setBlockActive(!blockActive)} onReset={() => setBlockTimer(0)} 
        />
        <div style={{ width:'1px', height:'30px', backgroundColor:'#1e1e2e' }} />
        <button onClick={() => { 
            setCommercialTimer(0); setCommercialActive(false);
            setBreakTimer(0); setBreakActive(false);
            setBlockTimer(0); setBlockActive(false);
          }}
          style={{ backgroundColor:'#1f2937', color:'#ef4444', border:'1px solid #374151', borderRadius:'2px', padding:'4px 10px', cursor:'pointer', fontSize:'10px', fontWeight: 'bold' }}>
          ✖ ZERAR TUDO
        </button>
        <div style={{ marginLeft:'auto', display:'flex', gap:'6px', alignItems:'center' }}>
          {/* Language switcher */}
          <span style={{ fontSize:'10px', color:'#6b7280' }}>{t.lang}:</span>
          {(['pt-BR','en','es'] as const).map(l => (
            <button key={l} onClick={() => setLang(l)}
              style={{ backgroundColor: lang === l ? '#646cff' : '#1f2937', color:'#fff', border:'none', borderRadius:'2px', padding:'3px 8px', cursor:'pointer', fontSize:'10px' }}>
              {l === 'pt-BR' ? '🇧🇷' : l === 'en' ? '🇺🇸' : '🇪🇸'}
            </button>
          ))}
          <div style={{ width:'1px', height:'20px', backgroundColor:'#1e1e2e' }} />
          
          {/* Overlay Quick Toggles */}
          {overlayConfig && onUpdateLayer && (
            <div style={{ display:'flex', gap:'5px', alignItems:'center' }}>
              {(overlayConfig.layers || []).filter((l:any) => l.type === 'clock' || l.type === 'ticker' || l.type === 'image' || l.type === 'text').map((l: any) => {
                const icon = l.type === 'clock' ? '🕒' : l.type === 'ticker' ? '📰' : l.type === 'image' ? '🎨' : '📝';
                return (
                  <button key={l.id} 
                    onClick={() => onUpdateLayer(l.id, { enabled: !l.enabled })}
                    title={`Ativar/Desativar ${l.label}`}
                    style={{ 
                      backgroundColor: l.enabled ? '#7c3aed' : '#1f2937', 
                      color: l.enabled ? '#fff' : '#9ca3af', 
                      border: l.enabled ? '1px solid #8b5cf6' : '1px solid #374151', 
                      borderRadius:'4px', padding:'4px 8px', fontSize:'11px', cursor:'pointer',
                      display:'flex', alignItems:'center', gap:'6px', transition:'all 0.2s ease',
                      boxShadow: l.enabled ? '0 0 8px rgba(124,58,237,0.4)' : 'none',
                      whiteSpace: 'nowrap'
                    }}>
                    <span style={{ fontSize:'13px' }}>{icon}</span> 
                    <span>{l.label.length > 12 ? l.label.substring(0,10)+'..' : l.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          <div style={{ width:'1px', height:'20px', backgroundColor:'#1e1e2e' }} />
          {/* Botão INICIAR LIVE no MCR */}
          {!isStreaming ? (
            <button onClick={onStartLive}
              style={{ backgroundColor:'#dc2626', color:'#fff', border:'none', borderRadius:'2px', padding:'4px 12px', cursor:'pointer', fontSize:'11px', fontWeight:'bold', boxShadow:'0 0 10px rgba(220,38,38,0.4)' }}>
              ● INICIAR LIVE
            </button>
          ) : (
            <button onClick={onStopLive}
              style={{ backgroundColor:'#111', color:'#ef4444', border:'1px solid #ef4444', borderRadius:'2px', padding:'4px 12px', cursor:'pointer', fontSize:'11px', fontWeight:'bold' }}>
              FORA DO AR
            </button>
          )}
          <div style={{ width:'1px', height:'20px', backgroundColor:'#1e1e2e' }} />
          <button onClick={addChannel} disabled={channels.length >= 8}
            style={{ backgroundColor: channels.length < 8 ? '#065f46' : '#1f2937', color: channels.length < 8 ? '#4ade80' : '#6b7280', border:'none', borderRadius:'2px', padding:'4px 12px', cursor: channels.length < 8 ? 'pointer' : 'not-allowed', fontSize:'10px', fontWeight:'bold' }}>
            {t.addChannel} ({channels.length}/8)
          </button>
          <div style={{ width:'1px', height:'20px', backgroundColor:'#1e1e2e' }} />
          <button 
            onClick={() => {
              const cfg = JSON.parse(localStorage.getItem('autodj-config') || '{"enabled":false}');
              cfg.enabled = !cfg.enabled;
              localStorage.setItem('autodj-config', JSON.stringify(cfg));
              // Force a state update if needed, but App.tsx will pick it up on next tick
              window.dispatchEvent(new Event('storage')); 
            }}
            style={{ 
              backgroundColor: JSON.parse(localStorage.getItem('autodj-config') || '{"enabled":false}').enabled ? '#7c3aed' : '#1f2937', 
              color:'#fff', border:'none', borderRadius:'2px', padding:'4px 12px', cursor:'pointer', fontSize:'10px', fontWeight:'bold' 
            }}
          >
            🎵 AUTO DJ: {JSON.parse(localStorage.getItem('autodj-config') || '{"enabled":false}').enabled ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      {/* Channel Grid */}
      <div style={{ flex:1, display:'flex', gap:'6px', padding:'6px', overflowX:'auto', overflowY:'hidden' }}>
        {channels.map(ch => (
          <ChannelPanel
            key={ch.id} channel={ch} t={t} now={now} videos={videos}
            isOnAir={onAirChannelId === ch.id}
            onUpdate={data => updateChannel(ch.id, data)}
            onRemove={() => removeChannel(ch.id)}
            onPlayEvent={(ev) => {
              if (ev) {
                setOnAirChannelId(ch.id);
                if (isStreaming && onSwitchStream) {
                  onSwitchStream(ev.filePath, ev.title, ev.platform, ev.radioUrl, ev.bannerUrl);
                }
              } else {
                if (onAirChannelId === ch.id) setOnAirChannelId(null);
                if (isStreaming && onSwitchStream) {
                  onSwitchStream(null, 'MCR_IDLE', 'local');
                }
              }
            }}
          />
        ))}
        {channels.length === 0 && (
          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'#374151', flexDirection:'column', gap:'12px' }}>
            <div style={{ fontSize:'48px' }}>📺</div>
            <div style={{ fontSize:'14px' }}>{t.addChannel} para começar</div>
            <button onClick={addChannel} style={{ backgroundColor:'#646cff', color:'#fff', border:'none', borderRadius:'4px', padding:'10px 24px', cursor:'pointer', fontSize:'14px' }}>
              {t.addChannel}
            </button>
          </div>
        )}
      </div>

      {/* Status bar */}
      <div style={{ height:'22px', backgroundColor:'#0a0a14', borderTop:'1px solid #1e1e2e', display:'flex', alignItems:'center', padding:'0 12px', gap:'16px', fontSize:'9px', color:'#374151', flexShrink:0 }}>
        <span>SYSTEM_NOMINAL</span>
        <span>CHANNELS: {channels.length}/8</span>
        <span>ACTIVE: {channels.filter(c=>c.isActive).length}</span>
        <span style={{ marginLeft:'auto' }}>{t.dragHint}</span>
      </div>
    </div>
  );
};

export default MCRPro;
