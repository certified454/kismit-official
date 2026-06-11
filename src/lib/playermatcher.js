import { loadPlayerDB } from './initDatabase.js';

function normalizeString(str) {
  return str
    .toLowerCase()
    .normalize('NFD')                 // Separates letters from accents (é -> e + ´)
    .replace(/[\u0300-\u036f]/g, '')   // Strips the accent marks off
    .replace(/[^a-z0-9\s]/g, '')       // Drops special characters
    .trim();
}

export function identifyPlayerFromPrompt(promptText) {
  if (!promptText || !promptText.trim()) return null;

  const cleanPrompt = normalizeString(promptText);
  const players = loadPlayerDB();

  let bestMatch = null;
  let highestScore = 0;

  for (const player of players) {
    let currentScore = 0;

    // Check individual keyword arrays (e.g. "mbappe", "kylian", "ryan")
    if (player.searchKeywords && Array.isArray(player.searchKeywords)) {
      for (const keyword of player.searchKeywords) {
        if (cleanPrompt.includes(normalizeString(keyword))) {
          currentScore += 2; // Strong keyword match weight
        }
      }
    }

    // Direct official name block check
    const cleanOfficial = normalizeString(player.officialName || '');
    if (cleanOfficial && cleanPrompt.includes(cleanOfficial)) {
      currentScore += 5; // Multi-word precise phrase bonus
    }

    if (currentScore > highestScore) {
      highestScore = currentScore;
      bestMatch = player;
    }
  }

  if (bestMatch && highestScore > 0) {
    console.log(`[PlayerMatch] 🎯 Match Found: "${promptText}" → ${bestMatch.officialName}`);
    return bestMatch;
  }

  console.log(`[PlayerMatch] ❌ No match found in local configurations for: "${promptText}"`);
  return null;
}