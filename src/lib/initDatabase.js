import fs from 'fs';
import path from 'path';

const GITHUB_PLAYER_DATA_URL = 'https://raw.githubusercontent.com/manutd0787/Football-Players-Dataset/master/players_metadata.json';

// ── Alias dictionary for well-known players ──────────────────
// Add more as needed. Keys are substrings of official names.
const ALIAS_MAP = {
  'Cristiano Ronaldo': ['cr7', 'ronaldo', 'ronny', 'cristiano'],
  'Lionel Messi':      ['messi', 'leo', 'pulga', 'la pulga'],
  'Kylian Mbappe':     ['mbappe', 'kylian', 'mbappé'],
  'Erling Haaland':    ['haaland', 'erling'],
  'Neymar':            ['neymar', 'ney', 'jr'],
  'Mohamed Salah':     ['salah', 'mo salah', 'egyptian king'],
  'Vinicius Junior':   ['vinicius', 'vini', 'vini jr'],
  'Pedri':             ['pedri'],
  'Jude Bellingham':   ['bellingham', 'jude'],
};

export async function bulkSeedFootballDatabase() {
  console.log('📥 [DB] Syncing players from open source GitHub repo...');

  const dbPath  = path.join(process.cwd(), 'data', 'footballers.json');
  const dataDir = path.dirname(dbPath);

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // If already seeded today, skip re-download
  if (fs.existsSync(dbPath)) {
    const stat = fs.statSync(dbPath);
    const ageHours = (Date.now() - stat.mtimeMs) / 3600000;
    if (ageHours < 24) {
      console.log('✅ [DB] Player data is fresh (< 24h old). Skipping re-sync.');
      return;
    }
  }

  try {
    const response = await fetch(GITHUB_PLAYER_DATA_URL);

    if (!response.ok) {
      throw new Error(`GitHub fetch failed: ${response.status}`);
    }

    const rawPlayers = await response.json();
    console.log(`[DB] Found ${rawPlayers.length} raw records. Processing...`);

    const structuredRecords = rawPlayers.map((player, index) => {
      const officialName = (player.FullName || player.Name || '').trim();
      if (!officialName) return null;

      // Base name tokens
      const baseTokens = officialName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')   // strip accents
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter((t) => t.length > 2);

      // Merge alias map entries
      const aliasTokens = [];
      for (const [nameKey, aliases] of Object.entries(ALIAS_MAP)) {
        if (officialName.includes(nameKey)) {
          aliasTokens.push(...aliases);
        }
      }

      return {
        playerId:       `player_${index + 1000}`,
        officialName,
        searchKeywords: [...new Set([...baseTokens, ...aliasTokens])],
        faceUrl:        player.PhotoUrl || null,
      };
    }).filter(Boolean);

    fs.writeFileSync(dbPath, JSON.stringify(structuredRecords, null, 2));
    console.log(`✅ [DB] Saved ${structuredRecords.length} players to ${dbPath}`);

  } catch (err) {
    console.error('❌ [DB] Bulk download failed:', err.message);
    // Write empty array so the app still starts
    if (!fs.existsSync(dbPath)) {
      fs.writeFileSync(dbPath, '[]');
    }
  }
}

// ── Load the DB into memory ───────────────────────────────────
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