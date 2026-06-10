import Fuse from 'fuse.js';
import { loadPlayerDB } from './initDatabase.js'

// ── Build Fuse.js search index once at startup ────────────────
let _fuse = null;

function getFuse() {
  if (_fuse) return _fuse;
  const players = loadPlayerDB();
  _fuse = new Fuse(players, {
    keys:              ['officialName', 'searchKeywords'],
    threshold:         0.35,   // 0 = exact, 1 = anything. 0.35 is tight but forgives typos
    includeScore:      true,
    minMatchCharLength: 3,
  });
  return _fuse;
}

// ── Try to identify a player from raw prompt text ─────────────
// Returns { playerId, officialName, faceUrl } or null
export function identifyPlayerFromPrompt(promptText) {
  if (!promptText || !promptText.trim()) return null;

  const fuse = getFuse();

  // Split the prompt into overlapping word windows (1, 2, and 3 word chunks)
  // so "replace Ronaldo boots" matches "Ronaldo" as a substring chunk
  const words  = promptText.trim().split(/\s+/);
  const chunks = [];

  for (let i = 0; i < words.length; i++) {
    chunks.push(words[i]);                                          // single word
    if (i + 1 < words.length) chunks.push(`${words[i]} ${words[i+1]}`);           // 2-word
    if (i + 2 < words.length) chunks.push(`${words[i]} ${words[i+1]} ${words[i+2]}`); // 3-word
  }

  let bestMatch = null;
  let bestScore = Infinity;   // Fuse score: lower = better

  for (const chunk of chunks) {
    const results = fuse.search(chunk);
    if (results.length > 0 && results[0].score < bestScore) {
      bestScore = results[0].score;
      bestMatch = results[0].item;
    }
  }

  if (bestMatch && bestScore < 0.35) {
    console.log(`[PlayerMatch] "${promptText}" → "${bestMatch.officialName}" (score: ${bestScore.toFixed(3)})`);
    return bestMatch;
  }

  console.log(`[PlayerMatch] No player match found in prompt: "${promptText}"`);
  return null;
}