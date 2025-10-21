import mongoose from "mongoose";
import express from "express";
import axios from "axios";
import Team from "../modules/team.js";
import Player from "../modules/player.js";
import protectRoute from "../middleware/auth.middleware.js";

const router = express.Router();

// --- inline ESPN helpers (self-contained) ---
const ESPN_BASE = process.env.ESPN_BASE_URL || 'https://fantasy.espn.com/apis/v3/games/ffl';
const SEASON = process.env.ESPN_SEASON || new Date().getFullYear();
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour

const cache = {
  search: new Map(), // key -> { ts, results }
  player: new Map()  // id -> { ts, player }
};

async function fetchJson(url) {
  const res = await axios.get(url, { headers: { 'User-Agent': 'kismet-backend/1.0' }, timeout: 8000 });
  return res.data;
}

function cacheGet(map, key) {
  const entry = map.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    map.delete(key);
    return null;
  }
  return entry.val;
}

function cacheSet(map, key, val) {
  map.set(key, { ts: Date.now(), val });
}

/**
 * Search ESPN players by name -> returns [{ espnId, name, position, raw }, ...]
 */
async function searchPlayers(query) {
  if (!query) return [];
  const key = query.trim().toLowerCase();
  const cached = cacheGet(cache.search, key);
  if (cached) return cached;

  const url = `${ESPN_BASE}/seasons/${SEASON}/players?search=${encodeURIComponent(query)}&view=players_wl`;
  try {
    const data = await fetchJson(url);
    if (!Array.isArray(data)) {
      cacheSet(cache.search, key, []);
      return [];
    }
    const results = data.map(p => ({
      espnId: p.id ?? p.playerId ?? null,
      name: (p.fullName ?? `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim()) || p.name || null,
      position: p.defaultPosition ?? p.position ?? null,
      raw: p
    })).filter(r => r.name);
    cacheSet(cache.search, key, results);
    return results;
  } catch (err) {
    console.error('espn.searchPlayers error', err?.message || err);
    return [];
  }
}

/**
 * Get ESPN player by id -> returns { espnId, name, position, raw } or null
 */
async function getPlayerById(espnId) {
  if (!espnId) return null;
  const cached = cacheGet(cache.player, espnId);
  if (cached) return cached;

  const url = `${ESPN_BASE}/players/${espnId}`;
  try {
    const p = await fetchJson(url);
    if (!p) return null;
    const result = {
      espnId: p.id ?? espnId,
      name: p.fullName ?? `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim(),
      position: p.defaultPosition ?? null,
      raw: p
    };
    cacheSet(cache.player, espnId, result);
    return result;
  } catch (err) {
    console.error('espn.getPlayerById error', err?.message || err);
    return null;
  }
}
// --- end inline ESPN helpers ---

// ---- ADDED: search route ----
/**
 * GET /team/search?q=...
 * Returns an array of { espnId, name, position } for frontend autocomplete.
 */
router.get('/search', protectRoute, async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  if (!q) return res.status(400).json({ results: [], message: 'Missing query parameter q' });

  try {
    const results = await searchPlayers(q);
    const simplified = (results || []).map(r => ({
      espnId: r.espnId,
      name: r.name,
      position: r.position
    }));
    return res.json({ results: simplified });
  } catch (err) {
    console.error('teamRoutes.search error', err?.message || err);
    return res.status(500).json({ results: [], message: 'ESPN search failed' });
  }
});
// ---- end added route ----

//create team route
router.post('/register', protectRoute, async (req, res) => {
    const userId = req.user._id;
    const { name, players } = req.body;
    try {
        if (!name || !players) {
            console.log('All fields are required')
            return res.status(400).json({ message: 'All fields are required' });
        }

        if (!Array.isArray(players) || players.length !== 7) {
            console.log('You must add exactly seven players to make a team');
            return res.status(400).json({ message: 'You must add exactly seven players to make a team' });
        }

        const playerIds = [];

        for (const entry of players) {
            // Normalize incoming entry (supports string, { name, position }, or { espnId })
            let nameVal = null;
            let posVal = null;
            let espnIdVal = null;

            if (typeof entry === 'string') {
                nameVal = entry;
            } else if (entry && typeof entry === 'object') {
                nameVal = entry.name || null;
                posVal = entry.position || null;
                espnIdVal = entry.espnId || null;
            }

            // Try to resolve ESPN info
            let espnInfo = null;
            if (espnIdVal) {
                espnInfo = await getPlayerById(espnIdVal);
            }
            if (!espnInfo && nameVal) {
                const results = await searchPlayers(nameVal);
                if (results && results.length > 0) {
                    espnInfo = results[0];
                }
            }

            const finalName = espnInfo?.name || nameVal || 'Unnamed';
            const finalPos = espnInfo?.position || posVal || 'UNK';
            const finalEspnId = espnInfo?.espnId || espnIdVal || null;
            const finalRaw = espnInfo?.raw || null;

            // Find existing player by espnId first, then by name+position
            let player = null;
            if (finalEspnId) {
                player = await Player.findOne({ espnId: finalEspnId });
            }
            if (!player) {
                player = await Player.findOne({ name: finalName, position: finalPos });
            }

            if (!player) {
                player = new Player({
                    name: finalName,
                    position: finalPos,
                    ...(finalEspnId ? { espnId: finalEspnId } : {}),
                    ...(finalRaw ? { espnRaw: finalRaw } : {})
                });
                await player.save();
            } else {
                // update missing espn metadata if found
                let shouldSave = false;
                if (!player.espnId && finalEspnId) {
                    player.espnId = finalEspnId;
                    shouldSave = true;
                }
                if (!player.espnRaw && finalRaw) {
                    player.espnRaw = finalRaw;
                    shouldSave = true;
                }
                if (shouldSave) await player.save();
            }

            // ensure we don't push duplicates
            if (!playerIds.some(id => id.toString() === player._id.toString())) {
                playerIds.push(player._id);
            }
        };

        const newTeam = new Team({
            name,
            owner: userId,
            players: playerIds
        });
        await newTeam.save();
        res.status(201).json({ message: 'Team created successfully', team: newTeam })
    } catch (error) {
        console.log('internal server error', error);
        res.status(500).json({message: 'internal server error', error: error.message})
    }
})

//get the team created a set it for the challange creation
router.get('/', protectRoute, async (req, res) => {
    const userId = req.user._id;
    try {
        const userTeam = await Team.findOne({ owner: userId })
        .sort({createdAt: -1})
        .populate('players', 'name position espnId');

        if (!userTeam) {
            console.log('Team not found');
            return res.status(404).json({ message: 'Team not found' });
        };
        res.send({ userTeam, message: 'Team found' });
    } catch (error) {
        console.log('internal server error');
        res.status(500).json({message: 'internal server error', error: error.message});
    }
})

export default router;