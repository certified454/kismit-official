import fs from 'fs';
import path from 'path';

let _playerCache = null;

// Clean out the old GitHub function so it doesn't try to connect to dead endpoints
export async function bulkSeedFootballDatabase() {
  console.log('📦 [DB] Local database tracking initialized. Using verified offline dataset.');
  const dbPath = path.join(process.cwd(), 'data', 'footballers.json');
  
  if (!fs.existsSync(dbPath)) {
    const dataDir = path.dirname(dbPath);
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(dbPath, '[]');
    console.warn('⚠️ [DB] data/footballers.json was missing, created empty array.');
  }
}

export function loadPlayerDB() {
  if (_playerCache) return _playerCache;
  
  const dbPath = path.join(process.cwd(), 'data', 'footballers.json');
  if (!fs.existsSync(dbPath)) return [];
  
  try {
    _playerCache = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    return _playerCache;
  } catch (err) {
    console.error('❌ [DB] Error reading local footballers.json configuration:', err.message);
    return [];
  }
}