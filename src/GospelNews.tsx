import React, { useState, useEffect } from 'react';
import { fetchGospelNews, type GospelNews } from './services/api';

interface GospelNewsProps {
  onOpenLiveStream?: () => void;
  onAnnounceNews?: (news: GospelNews) => void;
}

const GospelNewsComponent: React.FC<GospelNewsProps> = ({ onOpenLiveStream, onAnnounceNews }) => {
  const [news, setNews] = useState<GospelNews[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNews, setSelectedNews] = useState<GospelNews | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    loadNews();
    const interval = setInterval(loadNews, 5 * 60 * 1000); // Atualiza a cada 5 minutos
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll through news
  useEffect(() => {
    if (!autoScroll || news.length === 0) return;

    const timer = setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % news.length);
    }, 8000); // Muda notícia a cada 8 segundos

    return () => clearTimeout(timer);
  }, [autoScroll, currentIndex, news.length]);

  const loadNews = async () => {
    setLoading(true);
    try {
      const newsData = await fetchGospelNews();
      setNews(newsData);
      if (newsData.length > 0) {
        setSelectedNews(newsData[0]);
      }
    } catch (err) {
      console.error('Erro ao carregar notícias:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectNews = (item: GospelNews, index: number) => {
    setSelectedNews(item);
    setCurrentIndex(index);
    setAutoScroll(false);
    // Dispara o callback para anunciar a notícia (abaixar rádio, exibir no ticker e falar via TTS)
    if (onAnnounceNews) {
      onAnnounceNews(item);
    }
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      'musica': '#ff6b6b',
      'social': '#4ecdc4',
      'evento': '#95e1d3',
      'biblia': '#a8dadc',
      'news': '#457b9d',
      'info': '#f1faee'
    };
    return colors[category] || '#95e1d3';
  };

  const getCategoryEmoji = (category: string) => {
    const emojis: Record<string, string> = {
      'musica': '🎵',
      'social': '🤝',
      'evento': '📅',
      'biblia': '📖',
      'news': '📰',
      'info': 'ℹ️'
    };
    return emojis[category] || '✝️';
  };

  return (
    <div className="fade-in" style={{ padding: '40px', color: '#fff', height: '100%', overflowY: 'auto', backgroundColor: 'var(--bg-primary)' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '32px', fontWeight: '900', letterSpacing: '-1px' }}>
            NOTÍCIAS <span style={{ color: 'var(--accent-primary)' }}>GOSPEL</span>
          </h1>
          <p style={{ color: 'var(--text-secondary)', margin: '5px 0 0 0', fontSize: '14px' }}>
            Fique atualizado com as últimas notícias do mundo gospel e cristão
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            style={{
              backgroundColor: autoScroll ? 'var(--accent-secondary)' : 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              color: '#fff',
              padding: '10px 20px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '12px'
            }}
          >
            {autoScroll ? '⏸ Auto-Scroll ON' : '▶ Auto-Scroll OFF'}
          </button>
          <button
            onClick={loadNews}
            disabled={loading}
            style={{
              backgroundColor: 'var(--accent-primary)',
              border: 'none',
              color: '#fff',
              padding: '10px 20px',
              borderRadius: '8px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontWeight: 'bold',
              fontSize: '12px',
              opacity: loading ? 0.6 : 1
            }}
          >
            🔄 {loading ? 'Atualizando...' : 'Atualizar'}
          </button>
        </div>
      </div>

      {/* Main News Display */}
      {loading && news.length === 0 ? (
        <div className="glass-panel" style={{ padding: '60px', borderRadius: '20px', textAlign: 'center' }}>
          <div style={{ fontSize: '40px', marginBottom: '20px', animation: 'pulse 1.5s infinite' }}>
            📰
          </div>
          <p style={{ fontSize: '16px', color: 'var(--text-secondary)' }}>Carregando notícias gospel...</p>
        </div>
      ) : selectedNews ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: '30px', alignItems: 'start', marginBottom: '40px' }}>
          {/* Featured News */}
          <div className="glass-panel" style={{ borderRadius: '20px', overflow: 'hidden', padding: '30px', position: 'relative' }}>
            <div style={{ position: 'absolute', top: '20px', right: '20px', backgroundColor: getCategoryColor(selectedNews.category), padding: '8px 16px', borderRadius: '20px', fontWeight: 'bold', fontSize: '12px', color: '#000' }}>
              {getCategoryEmoji(selectedNews.category)} {selectedNews.category.toUpperCase()}
            </div>

            {/* Featured Image */}
            <img
              src={selectedNews.image}
              alt={selectedNews.title}
              style={{
                width: '100%',
                height: '300px',
                objectFit: 'cover',
                borderRadius: '12px',
                marginBottom: '25px',
                border: '2px solid var(--border-color)'
              }}
              onError={(e) => {
                (e.target as HTMLImageElement).src = 'https://via.placeholder.com/600x300?text=Gospel+News';
              }}
            />

            {/* News Content */}
            <div style={{ marginBottom: '20px' }}>
              <h2 style={{ fontSize: '28px', fontWeight: '900', marginBottom: '15px', lineHeight: 1.3 }}>
                {selectedNews.title}
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontWeight: 'bold' }}>📅 {selectedNews.publishedAt}</span>
                <span style={{ color: 'var(--accent-primary)', fontWeight: 'bold' }}>📢 {selectedNews.source}</span>
              </p>
            </div>

            {/* Description */}
            <div style={{ backgroundColor: 'rgba(255,255,255,0.05)', padding: '20px', borderRadius: '12px', marginBottom: '20px', borderLeft: `4px solid ${getCategoryColor(selectedNews.category)}` }}>
              <p style={{ fontSize: '14px', lineHeight: 1.6, color: '#ddd', margin: 0 }}>
                {selectedNews.description}
              </p>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <a
                href={selectedNews.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: 'rgba(255,255,255,0.1)',
                  color: '#fff',
                  padding: '12px 20px',
                  borderRadius: '8px',
                  textDecoration: 'none',
                  fontWeight: 'bold',
                  fontSize: '13px',
                  cursor: 'pointer',
                  border: '1px solid rgba(255,255,255,0.2)',
                  transition: '0.2s'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.8')}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
              >
                🔗 Abrir no Navegador
              </a>
              <button
                onClick={onOpenLiveStream}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: 'var(--accent-danger)',
                  color: '#fff',
                  padding: '12px 20px',
                  borderRadius: '8px',
                  fontWeight: 'bold',
                  fontSize: '13px',
                  cursor: 'pointer',
                  border: 'none',
                  transition: '0.2s'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.8')}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
              >
                🔴 Ir para Transmissão
              </button>
            </div>
          </div>

          {/* Sidebar - News List */}
          <div className="glass-panel" style={{ borderRadius: '20px', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '600px' }}>
            <div style={{ padding: '15px 20px', backgroundColor: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border-color)', fontSize: '11px', fontWeight: '900', letterSpacing: '1px' }}>
              📋 OUTRAS NOTÍCIAS
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
              {news.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#444', fontSize: '12px', padding: '20px' }}>
                  Nenhuma notícia disponível
                </p>
              ) : (
                news.map((item, index) => (
                  <div
                    key={item.id}
                    onClick={() => handleSelectNews(item, index)}
                    style={{
                      padding: '12px',
                      marginBottom: '10px',
                      borderRadius: '10px',
                      backgroundColor: index === currentIndex ? 'rgba(100,108,255,0.15)' : 'transparent',
                      border: index === currentIndex ? '1px solid rgba(100,108,255,0.3)' : '1px solid transparent',
                      cursor: 'pointer',
                      transition: '0.2s',
                      borderLeft: `4px solid ${getCategoryColor(item.category)}`
                    }}
                    onMouseEnter={(e) => {
                      if (index !== currentIndex) {
                        e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (index !== currentIndex) {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }
                    }}
                  >
                    <div style={{ fontSize: '11px', fontWeight: 'bold', color: index === currentIndex ? '#fff' : '#aaa', marginBottom: '4px' }}>
                      {getCategoryEmoji(item.category)} {item.category.toUpperCase()}
                    </div>
                    <div style={{ fontSize: '12px', fontWeight: 'bold', color: index === currentIndex ? '#fff' : '#ccc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.title}
                    </div>
                    <div style={{ fontSize: '9px', color: 'var(--text-secondary)', marginTop: '3px' }}>
                      {item.publishedAt}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="glass-panel" style={{ padding: '60px', borderRadius: '20px', textAlign: 'center' }}>
          <p style={{ fontSize: '16px', color: 'var(--text-secondary)' }}>Nenhuma notícia disponível</p>
        </div>
      )}

      {/* Stats */}
      {news.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginTop: '30px' }}>
          <div className="glass-panel" style={{ padding: '15px', borderRadius: '12px', textAlign: 'center' }}>
            <div style={{ fontSize: '24px', fontWeight: '900', color: 'var(--accent-primary)', marginBottom: '5px' }}>
              {news.length}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 'bold' }}>
              NOTÍCIAS CARREGADAS
            </div>
          </div>
          <div className="glass-panel" style={{ padding: '15px', borderRadius: '12px', textAlign: 'center' }}>
            <div style={{ fontSize: '24px', fontWeight: '900', color: 'var(--accent-secondary)', marginBottom: '5px' }}>
              {new Set(news.map(n => n.source)).size}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 'bold' }}>
              FONTES ATIVAS
            </div>
          </div>
          <div className="glass-panel" style={{ padding: '15px', borderRadius: '12px', textAlign: 'center' }}>
            <div style={{ fontSize: '24px', fontWeight: '900', color: '#95e1d3', marginBottom: '5px' }}>
              {new Set(news.map(n => n.category)).size}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 'bold' }}>
              CATEGORIAS
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GospelNewsComponent;