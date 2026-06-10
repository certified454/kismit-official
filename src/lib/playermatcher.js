import Fuse from 'fuse.js';
import { loadPlayerDB } from './initDatabase.js';

let _fuse = null;

function getFuse() {
  if (_fuse) return _fuse;
  const players = loadPlayerDB();
  
  _fuse = new Fuse(players, {
    keys: ['officialName', 'searchKeywords'],
    threshold: 0.4, // Forgives typos or partial strings (like matching "Hakimi" out of "Achraf Hakimi")
    includeScore: true,
    minMatchCharLength: 3,
  });
  return _fuse;
}

export function identifyPlayerFromPrompt(promptText) {
  if (!promptText || !promptText.trim()) return null;

  const fuse = getFuse();
  const words = promptText.trim().split(/\s+/);
  const chunks = [];

  // Break prompt into search phrases ("Wear", "Hakimi", "Wear Hakimi")
  for (let i = 0; i < words.length; i++) {
    chunks.push(words[i]);                                       
    if (i + 1 < words.length) chunks.push(`${words[i]} ${words[i+1]}`);           
    if (i + 2 < words.length) chunks.push(`${words[i]} ${words[i+1]} ${words[i+2]}`); 
  }

  let bestMatch = null;
  let bestScore = Infinity;

  for (const chunk of chunks) {
    const results = fuse.search(chunk);
    if (results.length > 0 && results[0].score < bestScore) {
      bestScore = results[0].score;
      bestMatch = results[0].item;
    }
  }

  // If a strong fuzzy match is found directly against GitHub data, return it
  if (bestMatch && bestScore < 0.4) {
    console.log(`[PlayerMatch] 🎯 Match Found: "${promptText}" → ${bestMatch.officialName} (Score: ${bestScore.toFixed(3)})`);
    return bestMatch;
  }

  console.log(`[PlayerMatch] ❌ No match found in GitHub data for: "${promptText}"`);
  return null;
}