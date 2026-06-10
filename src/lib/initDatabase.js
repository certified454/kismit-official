import fs from 'fs';
import path from 'path';

const GITHUB_PLAYER_DATA_URL = 'https://raw.githubusercontent.com/manutd0787/Football-Players-Dataset/master/players_metadata.json';

export async function bulkSeedFootballDatabase() {
  console.log('📥 [DB] Syncing players from open source GitHub repo...');

  const dbPath  = path.join(process.cwd(), 'data', 'footballers.json');
  const dataDir = path.dirname(dbPath);

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  try {
    const response = await fetch(GITHUB_PLAYER_DATA_URL);
    if (!response.ok) throw new Error(`GitHub fetch failed: ${response.status}`);

    const rawPlayers = await response.json();
    console.log(`[DB] Found ${rawPlayers.length} raw records from GitHub. Processing...`);

    const structuredRecords = rawPlayers.map((player, index) => {
      // Direct extraction: Try every common naming convention used in public datasets
      const officialName = (
        player.FullName || 
        player.Name || 
        player.name || 
        player.playerName || 
        player.player_name || 
        ''
      ).trim();

      if (!officialName) return null;

      // Automatically tokenise the official name into keywords (e.g., "Achraf", "Hakimi")
      const nameTokens = officialName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Strips accents
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter((token) => token.length > 1);

      return {
        playerId: `player_${index + 1000}`,
        officialName, // e.g., "Achraf Hakimi"
        searchKeywords: nameTokens, // e.g., ["achraf", "hakimi"]
        faceUrl: player.PhotoUrl || player.photoUrl || player.image || null,
      };
    }).filter(Boolean);

    fs.writeFileSync(dbPath, JSON.stringify(structuredRecords, null, 2));
    console.log(`✅ [DB] Successfully compiled and saved ${structuredRecords.length} players.`);

  } catch (err) {
    console.error('❌ [DB] Bulk download failed:', err.message);
    if (!fs.existsSync(dbPath)) fs.writeFileSync(dbPath, '[]');
  }
}

let _playerCache = null;
export function loadPlayerDB() {
  if (_playerCache) return _playerCache;
  const dbPath = path.join(process.cwd(), 'data', 'footballers.json');
  if (!fs.existsSync(dbPath)) return [];
  try {
    _playerCache = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    return _playerCache;
  } catch {
    return [];
  }
}