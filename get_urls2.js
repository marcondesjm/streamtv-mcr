import fs from 'fs';
const html = fs.readFileSync('radio_html.txt', 'utf8');
const matches = html.match(/https?:\/\/[^\s"'\\<]+/g);
if (matches) {
  const urls = [...new Set(matches.filter(m => 
    m.includes('stream') || 
    m.includes('radio') || 
    m.includes('mp3') || 
    m.includes('aac') || 
    m.includes('cast') || 
    m.includes('shout') || 
    m.includes('ice') || 
    m.includes('play') ||
    m.includes('player')
  ))];
  console.log("Found URLs:", urls);
}
