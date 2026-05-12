import React, { useState, useEffect, useRef } from 'react';
import { fetchGospelNews, type GospelNews } from './services/api';
import { speakTts } from './services/tts';

interface VoiceConfig {
  voice: SpeechSynthesisVoice | null;
  pitch: number;
  rate: number;
  volume: number;
  enabled: boolean;
  autoAnnounce: boolean;
}

interface SoundEffect {
  id: string;
  name: string;
  emoji: string;
  url: string;
}

const SOUNDS: SoundEffect[] = [
  { id: '1', name: 'Aplausos', emoji: '👏', url: 'https://www.myinstants.com/media/sounds/applause_8.mp3' },
  { id: '2', name: 'Risada', emoji: '😂', url: 'https://www.myinstants.com/media/sounds/sitcom-laughing-1.mp3' },
  { id: '3', name: 'Laser', emoji: '🔫', url: 'https://www.myinstants.com/media/sounds/sci-fi-laser-gun.mp3' },
  { id: '4', name: 'Air Horn', emoji: '📢', url: 'https://www.myinstants.com/media/sounds/mlg-air-horn.mp3' },
  { id: '5', name: 'Drum Roll', emoji: '🥁', url: 'https://www.myinstants.com/media/sounds/drum-roll.mp3' },
  { id: '6', name: 'Wow!', emoji: '😮', url: 'https://www.myinstants.com/media/sounds/anime-wow-sound-effect.mp3' },
];

const VirtualAnnouncer: React.FC<{ currentTrack?: string; nextTrack?: string }> = ({ currentTrack, nextTrack }) => {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [config, setConfig] = useState<VoiceConfig>({
    voice: null,
    pitch: 1.1,
    rate: 0.75,
    volume: 1.0,
    enabled: true,
    autoAnnounce: false
  });
  const [text, setText] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [gospelNews, setGospelNews] = useState<GospelNews[]>([]);
  const [selectedNewsIndex, setSelectedNewsIndex] = useState(0);
  const [loadingNews, setLoadingNews] = useState(false);
  
  const synth = window.speechSynthesis;

  useEffect(() => {
    const loadVoices = () => {
      const availableVoices = synth.getVoices();
      setVoices(availableVoices);
      if (!config.voice && availableVoices.length > 0) {
        const ptVoice = availableVoices.find(v => v.lang.includes('pt-BR')) || availableVoices[0];
        setConfig(prev => ({ ...prev, voice: ptVoice }));
      }
    };

    loadVoices();
    if (synth.onvoiceschanged !== undefined) {
      synth.onvoiceschanged = loadVoices;
    }

    // Carrega as notícias gospel na inicialização
    loadGospelNews();
  }, []);

  const loadGospelNews = async () => {
    setLoadingNews(true);
    try {
      const news = await fetchGospelNews();
      setGospelNews(news);
    } catch (err) {
      console.error('Erro ao carregar notícias:', err);
    } finally {
      setLoadingNews(false);
    }
  };

  const speak = (content: string) => {
    if (!config.enabled || !content) return;
    
    // 1. Preview local (áudio no computador)
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(content);
    if (config.voice) utterance.voice = config.voice;
    utterance.pitch = config.pitch;
    utterance.rate = config.rate;
    utterance.volume = config.volume;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    
    synth.speak(utterance);

    // 2. Envia para o Electron gerar TTS via SAPI e misturar no stream RTMP
    speakTts(content).then((result: { success: boolean; error?: string }) => {
      if (result.success) {
        console.log('[TTS] Voz injetada no stream ao vivo com sucesso!');
      } else if (result.error && result.error !== 'TTS ao vivo disponível apenas no Electron') {
        console.warn('[TTS] Aviso:', result.error);
      }
    });
  };

  const announceTime = () => {
    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes();
    speak(`Agora são exatamente ${h} horas e ${m} minutos.`);
  };

  const playSound = (url: string) => {
    const audio = new Audio(url);
    audio.volume = config.volume;
    audio.play();
  };

  const announceCurrent = () => {
    if (currentTrack) speak(`Você está assistindo agora: ${currentTrack}`);
  };

  const announceNext = () => {
    if (nextTrack) speak(`Em seguida, teremos: ${nextTrack}`);
  };

  const announceNews = (newsIndex: number) => {
    if (gospelNews.length > newsIndex) {
      const news = gospelNews[newsIndex];
      const message = `Notícia Gospel: ${news.title}. ${news.description}`;
      speak(message);
    }
  };

  const announceAllNews = () => {
    if (gospelNews.length === 0) {
      speak('Nenhuma notícia gospel disponível no momento.');
      return;
    }
    const newsText = gospelNews.map((n, i) => `Notícia ${i + 1}: ${n.title}`).join('. ');
    speak(`Temos ${gospelNews.length} notícias gospel para você. ${newsText}`);
  };

  const lastTrack = useRef('');
  useEffect(() => {
    if (config.autoAnnounce && currentTrack && currentTrack !== lastTrack.current) {
      lastTrack.current = currentTrack;
      setTimeout(() => announceCurrent(), 2000);
    }
  }, [currentTrack, config.autoAnnounce]);

  return (
    <div className="fade-in" style={{ padding: '40px', color: '#fff', height: '100%', overflowY: 'auto' }}>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '30px', marginBottom: '40px' }}>
        <div style={{ fontSize: '60px', filter: 'drop-shadow(0 0 15px var(--accent-secondary))' }}>🤖</div>
        <div>
          <h1 style={{ margin: 0, fontSize: '32px', fontWeight: '900', letterSpacing: '-1px' }}>VIRTUAL <span style={{ color: 'var(--accent-secondary)' }}>ANNOUNCER</span></h1>
          <p style={{ color: 'var(--text-secondary)', margin: '5px 0 0 0', fontSize: '14px' }}>Locução profissional automatizada e soundboard em tempo real.</p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '15px' }}>
           <button 
            onClick={announceTime}
            className="btn-primary"
            style={{ backgroundColor: 'var(--accent-primary)', padding: '12px 24px', borderRadius: '10px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '10px' }}
          >
            🕒 FALAR HORA CERTA
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: '30px' }}>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
          
          {/* Main Input Area */}
          <div className="glass-panel" style={{ padding: '30px', borderRadius: '20px', border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.02)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
               <h3 style={{ margin: 0, fontSize: '11px', color: 'var(--accent-secondary)', fontWeight: '900', letterSpacing: '1px' }}>COMANDO DE VOZ AO VIVO</h3>
               <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>STATUS: {isSpeaking ? 'TRANSMITINDO_VOZ' : 'PRONTO'}</span>
            </div>
            <textarea 
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Digite o roteiro para o robô falar..."
              style={{ width: '100%', height: '160px', backgroundColor: 'rgba(0,0,0,0.3)', color: '#fff', border: '1px solid var(--border-color)', borderRadius: '15px', padding: '20px', fontSize: '18px', outline: 'none', marginBottom: '20px', resize: 'none', fontFamily: 'inherit' }}
            />
            <div style={{ display: 'flex', gap: '15px' }}>
              <button 
                onClick={() => speak(text)}
                className="btn-primary"
                style={{ flex: 1, height: '60px', fontSize: '16px', fontWeight: '900', borderRadius: '12px' }}
              >
                🎙️ EXECUTAR LOCUÇÃO AO VIVO
              </button>
              <button 
                onClick={() => synth.cancel()}
                style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--accent-danger)', border: '1px solid var(--accent-danger)', padding: '0 25px', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                PARAR
              </button>
            </div>
          </div>

          {/* Soundboard */}
          <div className="glass-panel" style={{ padding: '30px', borderRadius: '20px', border: '1px solid var(--border-color)' }}>
            <h3 style={{ margin: '0 0 25px 0', fontSize: '13px', fontWeight: 'bold', color: 'var(--text-secondary)' }}>🎚️ SOUNDBOARD / EFEITOS ESPECIAIS</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '15px' }}>
              {SOUNDS.map(s => (
                <button 
                  key={s.id} 
                  onClick={() => playSound(s.url)}
                  style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '15px', padding: '20px 10px', color: '#fff', cursor: 'pointer', transition: '0.2s', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
                >
                  <span style={{ fontSize: '32px' }}>{s.emoji}</span>
                  <span style={{ fontSize: '12px', fontWeight: 'bold' }}>{s.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
             <button onClick={announceCurrent} className="glass-panel" style={{ padding: '25px', borderRadius: '16px', border: '1px solid var(--border-color)', cursor: 'pointer', textAlign: 'left', background: 'transparent', transition: '0.2s' }}>
                <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '5px', fontWeight: '900' }}>AUTOMATION_HELPER</div>
                <div style={{ fontWeight: 'bold', fontSize: '16px', color: '#fff' }}>Anunciar Programa Atual</div>
             </button>
             <button onClick={announceNext} className="glass-panel" style={{ padding: '25px', borderRadius: '16px', border: '1px solid var(--border-color)', cursor: 'pointer', textAlign: 'left', background: 'transparent', transition: '0.2s' }}>
                <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '5px', fontWeight: '900' }}>AUTOMATION_HELPER</div>
                <div style={{ fontWeight: 'bold', fontSize: '16px', color: '#fff' }}>Anunciar Próximo Bloco</div>
             </button>
          </div>

          {/* Gospel News Section */}
          <div className="glass-panel" style={{ padding: '25px', borderRadius: '20px', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '13px', fontWeight: 'bold', color: 'var(--accent-primary)' }}>✝️ ANUNCIOS GOSPEL</h3>
              <button 
                onClick={loadGospelNews}
                disabled={loadingNews}
                style={{ fontSize: '10px', padding: '5px 10px', backgroundColor: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', borderRadius: '6px', cursor: 'pointer' }}
              >
                {loadingNews ? '⏳ Carregando' : '🔄 Atualizar'}
              </button>
            </div>

            {gospelNews.length === 0 ? (
              <p style={{ fontSize: '11px', color: 'var(--text-secondary)', textAlign: 'center', margin: '15px 0' }}>
                Nenhuma notícia disponível
              </p>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '15px' }}>
                  {gospelNews.slice(0, 2).map((news, idx) => (
                    <button
                      key={news.id}
                      onClick={() => {
                        setSelectedNewsIndex(idx);
                        announceNews(idx);
                      }}
                      style={{
                        padding: '12px',
                        backgroundColor: selectedNewsIndex === idx ? 'rgba(100,108,255,0.2)' : 'rgba(255,255,255,0.02)',
                        border: selectedNewsIndex === idx ? '1px solid var(--accent-primary)' : '1px solid var(--border-color)',
                        borderRadius: '10px',
                        color: '#fff',
                        cursor: 'pointer',
                        fontSize: '10px',
                        fontWeight: 'bold',
                        textAlign: 'left',
                        transition: '0.2s'
                      }}
                    >
                      <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: '4px' }}>
                        {news.title.substring(0, 30)}...
                      </div>
                      <div style={{ fontSize: '9px', color: 'var(--text-secondary)' }}>
                        {news.category}
                      </div>
                    </button>
                  ))}
                </div>
                <button
                  onClick={announceAllNews}
                  style={{
                    width: '100%',
                    padding: '12px',
                    backgroundColor: 'var(--accent-primary)',
                    border: 'none',
                    borderRadius: '10px',
                    color: '#fff',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    fontSize: '11px'
                  }}
                >
                  📢 ANUNCIAR TODAS AS NOTÍCIAS
                </button>
              </>
            )}
          </div>

        </div>

        {/* Right Sidebar: Config */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
          
          <div className="glass-panel" style={{ padding: '30px', borderRadius: '20px', border: '1px solid var(--border-color)' }}>
            <h3 style={{ margin: '0 0 25px 0', fontSize: '14px', fontWeight: 'bold' }}>CONFIGURAÇÕES DE VOZ</h3>
            
            <div style={{ marginBottom: '25px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', color: 'var(--accent-secondary)', fontSize: '14px', fontWeight: 'bold' }}>
                <input type="checkbox" checked={config.autoAnnounce} onChange={e => setConfig(p => ({ ...p, autoAnnounce: e.target.checked }))} style={{ width: '18px', height: '18px', accentColor: 'var(--accent-secondary)' }} />
                Locução Automática (Auto-AI)
              </label>
              <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '8px', marginLeft: '30px' }}>O robô anunciará novos programas automaticamente.</p>
            </div>

            <div style={{ marginBottom: '25px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '10px' }}>PERFIL DE VOZ</label>
              <select 
                value={config.voice?.name || ''} 
                onChange={e => {
                  const v = voices.find(v => v.name === e.target.value);
                  if (v) setConfig(p => ({ ...p, voice: v }));
                }}
                style={{ width: '100%', backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: '#fff', padding: '12px', borderRadius: '8px', outline: 'none' }}
              >
                {voices.map(v => (
                  <option key={v.name} value={v.name}>{v.name}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '25px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '10px', color: 'var(--text-secondary)' }}>
                <span>TOM DA VOZ (PITCH): {config.pitch}</span>
              </div>
              <input type="range" min="0.5" max="2" step="0.1" value={config.pitch} onChange={e => setConfig(p => ({ ...p, pitch: Number(e.target.value) }))} style={{ width: '100%', accentColor: 'var(--accent-secondary)' }} />
            </div>

            <div style={{ marginBottom: '30px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '10px', color: 'var(--text-secondary)' }}>
                <span>VELOCIDADE (RATE): {config.rate}</span>
              </div>
              <input type="range" min="0.5" max="2" step="0.1" value={config.rate} onChange={e => setConfig(p => ({ ...p, rate: Number(e.target.value) }))} style={{ width: '100%', accentColor: 'var(--accent-secondary)' }} />
            </div>
            
            <div style={{ backgroundColor: isSpeaking ? 'rgba(74,222,128,0.08)' : 'rgba(255,255,255,0.02)', padding: '20px', borderRadius: '12px', textAlign: 'center', border: '1px dashed var(--border-color)' }}>
              {isSpeaking ? (
                <div style={{ color: 'var(--accent-secondary)', fontSize: '13px', fontWeight: '900', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                  <div className="voice-waves">
                    <span /><span /><span />
                  </div>
                  PROCESSANDO_SAIDA_AUDIO
                </div>
              ) : (
                <span style={{ color: '#444', fontSize: '11px', fontWeight: 'bold' }}>STANDBY_MODE</span>
              )}
            </div>
          </div>

          <div className="glass-panel" style={{ padding: '25px', borderRadius: '20px', border: '1px solid var(--border-color)', background: 'transparent' }}>
             <h4 style={{ margin: '0 0 15px 0', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '900' }}>MONITOR_SISTEMA</h4>
             <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                <div style={{ marginBottom: '10px', display: 'flex', justifyContent: 'space-between' }}>
                   <span>No Ar:</span>
                   <span style={{ color: '#fff', fontWeight: 'bold' }}>{currentTrack || '---'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                   <span>Próximo:</span>
                   <span style={{ color: '#aaa' }}>{nextTrack || '---'}</span>
                </div>
             </div>
          </div>

        </div>
      </div>

      <style>{`
        .voice-waves { display: flex; gap: 3px; height: 16px; align-items: flex-end; }
        .voice-waves span { width: 3px; background: var(--accent-secondary); animation: bounce 0.8s infinite; border-radius: 2px; }
        .voice-waves span:nth-child(2) { animation-delay: 0.2s; height: 100%; }
        .voice-waves span:nth-child(3) { animation-delay: 0.4s; height: 70%; }
        @keyframes bounce { 0%, 100% { height: 40%; } 50% { height: 100%; } }
      `}</style>
    </div>
  );
};

export default VirtualAnnouncer;
