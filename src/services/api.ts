export interface VideoItem {
  id: string;
  title: string;
  duration: string;
  thumbnail: string;
  platform: 'twitch' | 'youtube' | 'local' | 'camera' | 'webradio';
  date: string;
  radioUrl?: string;
  bannerUrl?: string;
}

// ATENÇÃO: Substitua pelo seu Client ID real
const TWITCH_CLIENT_ID = 'seu_client_id_da_twitch_aqui';

// Converte duração da Twitch (1h30m10s -> 01:30:10)
function formatTwitchDuration(durationStr: string) {
  const match = durationStr.match(/(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/);
  if (!match) return "00:00:00";
  const h = match[1] ? match[1].padStart(2, '0') : "00";
  const m = match[2] ? match[2].padStart(2, '0') : "00";
  const s = match[3] ? match[3].padStart(2, '0') : "00";
  return `${h}:${m}:${s}`;
}

export const fetchTwitchVods = async (token?: string | null, clientId?: string): Promise<VideoItem[]> => {
  if (!token) return [];
  const effectiveClientId = clientId || TWITCH_CLIENT_ID;
  
  try {
    const userRes = await fetch('https://api.twitch.tv/helix/users', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Client-Id': effectiveClientId
      }
    });
    
    if (!userRes.ok) throw new Error("Falha ao buscar usuário da Twitch.");
    
    const userData = await userRes.json();
    if (!userData.data || userData.data.length === 0) return [];
    
    const userId = userData.data[0].id;

    const videoRes = await fetch(`https://api.twitch.tv/helix/videos?user_id=${userId}&type=archive`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Client-Id': effectiveClientId
      }
    });
    const videoData = await videoRes.json();
    
    return videoData.data.map((v: any) => ({
      id: v.id,
      title: v.title,
      duration: formatTwitchDuration(v.duration),
      thumbnail: v.thumbnail_url.replace('%{width}', '640').replace('%{height}', '360'),
      platform: 'twitch',
      date: new Date(v.created_at).toLocaleDateString()
    }));
  } catch (err) {
    console.error("Erro ao buscar Twitch VODs:", err);
    return [];
  }
};

// Converte duração do YouTube (PT1H30M10S -> 01:30:10)
function formatYouTubeDuration(durationStr: string) {
  const match = durationStr.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return "00:00:00";
  const h = match[1] ? match[1].padStart(2, '0') : "00";
  const m = match[2] ? match[2].padStart(2, '0') : "00";
  const s = match[3] ? match[3].padStart(2, '0') : "00";
  return `${h}:${m}:${s}`;
}

// Helper: lança erro com o corpo real da resposta do Google
async function assertOk(res: Response, context: string) {
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      const msg = body?.error?.message || body?.error || JSON.stringify(body);
      detail = `${res.status} — ${msg}`;
    } catch {}
    throw new Error(`[${context}] ${detail}`);
  }
}

// Lança erro em vez de retornar [] silenciosamente
export const fetchYouTubeVideos = async (token?: string | null): Promise<VideoItem[]> => {
  if (!token) return [];

  // 1. Busca o canal do usuário autenticado
  const chanRes = await fetch(
    `https://youtube.googleapis.com/youtube/v3/channels?part=contentDetails&mine=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  await assertOk(chanRes, 'channels');

  const chanData = await chanRes.json();
  if (!chanData.items || chanData.items.length === 0) {
    throw new Error('Nenhum canal do YouTube encontrado para esta conta.');
  }

  const uploadsPlaylistId = chanData.items[0].contentDetails.relatedPlaylists.uploads;

  // 2. Busca os últimos 20 vídeos do canal
  const plRes = await fetch(
    `https://youtube.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=20`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  await assertOk(plRes, 'playlistItems');

  const plData = await plRes.json();
  if (!plData.items || plData.items.length === 0) {
    return []; // canal existe mas sem vídeos
  }

  const videoIds = plData.items.map((i: any) => i.snippet.resourceId.videoId).join(',');

  // 3. Busca duração e thumbnail de cada vídeo
  const vidRes = await fetch(
    `https://youtube.googleapis.com/youtube/v3/videos?part=contentDetails,snippet&id=${videoIds}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  await assertOk(vidRes, 'videos');

  const vidData = await vidRes.json();

  const durationMap: Record<string, string> = {};
  const thumbnailMap: Record<string, string> = {};
  (vidData.items || []).forEach((v: any) => {
    durationMap[v.id] = formatYouTubeDuration(v.contentDetails?.duration || '');
    thumbnailMap[v.id] = v.snippet?.thumbnails?.high?.url
      || v.snippet?.thumbnails?.default?.url
      || '';
  });

  return plData.items.map((item: any) => {
    const vId = item.snippet.resourceId.videoId;
    return {
      id: vId,
      title: item.snippet.title,
      duration: durationMap[vId] || '01:00:00',
      thumbnail: thumbnailMap[vId] || item.snippet.thumbnails?.high?.url || '',
      platform: 'youtube',
      date: new Date(item.snippet.publishedAt).toLocaleDateString()
    };
  });
};

// Interface para Notícias Gospel
export interface GospelNews {
  id: string;
  title: string;
  description: string;
  source: string;
  url: string;
  image: string;
  publishedAt: string;
  category: string;
}

// Busca notícias gospel de múltiplas fontes
export const fetchGospelNews = async (): Promise<GospelNews[]> => {
  try {
    const newsArray: GospelNews[] = [];

    // Fonte 1: NewsAPI (exige chave gratuita, mas temos fallback)
    try {
      // Usando pesquisa pública (sem API key, com limite)
      const newsApiRes = await fetch(
        'https://newsapi.org/v2/everything?q=gospel%20OR%20cristã%20OR%20religião&sortBy=publishedAt&language=pt&pageSize=10'
      );
      if (newsApiRes.ok) {
        const newsData = await newsApiRes.json();
        if (newsData.articles) {
          newsData.articles.slice(0, 5).forEach((article: any) => {
            newsArray.push({
              id: `newsapi-${article.publishedAt}`,
              title: article.title,
              description: article.description || article.content || '',
              source: article.source.name,
              url: article.url,
              image: article.urlToImage || 'https://via.placeholder.com/300x200?text=Gospel',
              publishedAt: new Date(article.publishedAt).toLocaleDateString('pt-BR'),
              category: 'news'
            });
          });
        }
      }
    } catch (err) {
      console.log('NewsAPI indisponível, usando fontes alternativas');
    }

    // Fonte 2: Notícias da Bíblia Online (RSS Feed)
    try {
      const rssRes = await fetch(
        'https://api.allorigins.win/get?url=' + encodeURIComponent('https://feeds.biblia.com.br/rss')
      );
      if (rssRes.ok) {
        const data = await rssRes.json();
        const parser = new DOMParser();
        const xml = parser.parseFromString(data.contents, 'text/xml');
        const items = xml.querySelectorAll('item');
        
        items.forEach((item: any, idx: number) => {
          if (idx < 3) {
            newsArray.push({
              id: `biblia-${idx}`,
              title: item.querySelector('title')?.textContent || 'Notícia Bíblica',
              description: item.querySelector('description')?.textContent || '',
              source: 'Bíblia Online',
              url: item.querySelector('link')?.textContent || '#',
              image: 'https://via.placeholder.com/300x200?text=Bíblia',
              publishedAt: new Date().toLocaleDateString('pt-BR'),
              category: 'biblia'
            });
          }
        });
      }
    } catch (err) {
      console.log('Feed Bíblia Online indisponível');
    }

    // Fonte 3: Notícias Gospel Brasil (RSS simulado)
    try {
      const gospelNews: GospelNews[] = [
        {
          id: 'gospel-1',
          title: '🎵 Novo lançamento de música gospel marca presença nas plataformas',
          description: 'Artistas gospel brasileiros conquistam o topo das paradas com novas produções musicais.',
          source: 'Gospel Brasil',
          url: 'https://gospelbrasil.com.br',
          image: 'https://via.placeholder.com/300x200?text=Gospel+Música',
          publishedAt: new Date().toLocaleDateString('pt-BR'),
          category: 'musica'
        },
        {
          id: 'gospel-2',
          title: '✝️ Campanhas sociais evangélicas atuam em comunidades carentes',
          description: 'Igrejas evangélicas intensificam trabalho de assistência social em todo o Brasil.',
          source: 'Gospel Brasil',
          url: 'https://gospelbrasil.com.br',
          image: 'https://via.placeholder.com/300x200?text=Gospel+Social',
          publishedAt: new Date(Date.now() - 86400000).toLocaleDateString('pt-BR'),
          category: 'social'
        },
        {
          id: 'gospel-3',
          title: '🙏 Retiros espirituais atraem milhares de fiéis neste mês',
          description: 'Eventos de renovação espiritual ganham popularidade entre os fiéis evangélicos.',
          source: 'Gospel Brasil',
          url: 'https://gospelbrasil.com.br',
          image: 'https://via.placeholder.com/300x200?text=Gospel+Retiro',
          publishedAt: new Date(Date.now() - 172800000).toLocaleDateString('pt-BR'),
          category: 'evento'
        }
      ];
      newsArray.push(...gospelNews.slice(0, 3 - newsArray.length));
    } catch (err) {
      console.log('Notícias Gospel Brasil indisponível');
    }

    // Fallback: retorna notícias demonstrativas se nenhuma fonte funcionou
    if (newsArray.length === 0) {
      return [
        {
          id: 'demo-1',
          title: '🎵 Bem-vindo ao Feed de Notícias Gospel',
          description: 'Confira as últimas notícias do mundo gospel e religião cristã.',
          source: 'StreamTV Gospel',
          url: '#',
          image: 'https://via.placeholder.com/300x200?text=Gospel+News',
          publishedAt: new Date().toLocaleDateString('pt-BR'),
          category: 'info'
        }
      ];
    }

    return newsArray;
  } catch (err) {
    console.error('Erro ao buscar notícias gospel:', err);
    return [];
  }
};
