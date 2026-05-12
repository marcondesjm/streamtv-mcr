/**
 * Serviço de TTS (Text-to-Speech) para transmissão ao vivo
 * 
 * Envia texto para o processo Electron que:
 * 1. Gera áudio WAV via PowerShell SAPI (voz natural do Windows)
 * 2. Reproduz através de um named pipe para o FFmpeg
 * 3. Mistura no stream RTMP em tempo real
 * 
 * Também mantém o speechSynthesis do navegador para preview local
 */

let isElectron = false;

// Detecta se está rodando no Electron
try {
  // @ts-ignore - window.require está disponível no Electron
  if (window.require) {
    isElectron = true;
  }
} catch {
  isElectron = false;
}

/**
 * Envia um texto para ser falado na transmissão ao vivo
 * @param text Texto a ser falado
 * @returns Promise com o resultado
 */
export const speakTts = async (text: string): Promise<{ success: boolean; error?: string }> => {
  if (!text || !text.trim()) {
    return { success: false, error: 'Texto vazio' };
  }

  if (!isElectron) {
    console.log('[TTS] Rodando em browser - TTS ao vivo não disponível');
    return { success: false, error: 'TTS ao vivo disponível apenas no Electron' };
  }

  try {
    // @ts-ignore - window.require está disponível no Electron
    const ipcRenderer = window.require('electron').ipcRenderer;
    const result = await ipcRenderer.invoke('speak-tts', { text });
    return result;
  } catch (err) {
    console.error('[TTS] Erro ao comunicar com Electron:', err);
    return { success: false, error: String(err) };
  }
};

export default { speakTts };