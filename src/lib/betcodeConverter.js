// src/lib/betcodeConverter.js

const supportedBookies = [
    'sportybet', 
    '1xbet', 
    'bet9ja', 
    'nairabet', 
    'pinnacle'
];

// Simple normalizing dictionary to bridge naming gaps between different platforms
const teamDictionary = {
  "manchester united": "man_united", "man utd": "man_united", "man united fc": "man_united",
  "manchester city": "man_city", "man city": "man_city",
  "chelsea": "chelsea", "chelsea fc": "chelsea",
  "arsenal": "arsenal", "arsenal fc": "arsenal",
  "real madrid": "real_madrid", "barcelona": "barcelona"
};

const normalizeTeamName = (name) => {
  if (!name) return "";
  const clean = name.toLowerCase().trim();
  return teamDictionary[clean] || clean;
};

export const detectBookie = (code) => {
  if (!code || typeof code !== 'string') return null;
  const cleanCode = code.trim().toUpperCase();

  // If code includes explicit markers, detect them
  if (/SPORTY|SPRTY/.test(cleanCode)) return 'sportybet';
  if (/1X|1XBET|XBET/.test(cleanCode)) return '1xbet';
  if (/BET9JA|9JA/.test(cleanCode)) return 'bet9ja';

  // Fallback: SportyBet codes are typically short alphanumeric strings (e.g., BC34XYZ or 4A5F67)
  // If it's a raw code without a prefix, we can default to sportybet or bet9ja for processing
  return 'sportybet';
};

/**
 * Step 1: Fetch real game information using SportyBet's public backend service API
 */
const fetchRealSportybetSlip = async (code) => {
  // Strip out any prefixes user added like "SPORTY-" to get the raw booking code
  const rawCode = code.replace(/SPORTY|[-_\s]/gi, '').toUpperCase();
  
  // Real endpoint used by SportyBet's web app to fetch shared betslips
  const url = `https://services.sportybet.com/api/ng/realtime/wager/share/get/${rawCode}`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json',
      'Platform': 'web'
    }
  });

  if (!response.ok) {
    console.error(`SportyBet slip lookup failed with status: ${response.status}`);
    throw new Error(`SportyBet slip lookup failed with status: ${response.status}`);
  }

  if (response.ok) {
    console.log(`Successfully fetched SportyBet slip for code: ${rawCode}`);
  }
  const data = await response.json();

  if (data.status !== 10000 || !data.data) {
    throw new Error(data.message || "This booking code does not exist or has expired on SportyBet.");
  }

  const selections = data.data.selections || [];

  // Parse the raw payload into clean, actionable sports data structures
  const games = selections.map(game => ({
    sport: "Football",
    tournament: game.tournamentName,
    homeTeam: game.homeTeam,
    awayTeam: game.awayTeam,
    normalizedHome: normalizeTeamName(game.homeTeam),
    normalizedAway: normalizeTeamName(game.awayTeam),
    market: game.marketName,         // e.g., "GG/NG"
    selection: game.outcomeName,     // e.g., "Yes"
    odds: game.odds
  }));

  return {
    bookie: 'sportybet',
    rawCode,
    gamesCount: games.length,
    games
  };
};

export const parseBetcode = async (code, bookie) => {
  if (!code || typeof code !== 'string') {
    throw new Error('A bet code is required.');
  }

  const chosenBookie = bookie ? bookie.toLowerCase() : detectBookie(code);
  
  if (chosenBookie === 'sportybet') {
    return await fetchRealSportybetSlip(code);
  }

  // Fallback structure for other bookies until we add their scrapers/parsers
  return {
    bookie: chosenBookie,
    rawCode: code,
    games: []
  };
};

/**
 * Step 2 & 3: Match those games onto the target platform and get a fresh code
 */
export const buildTargetBookieCode = async (decodedSlip, targetBookie) => {
  const target = targetBookie.toLowerCase();

  // ✅ FIX: Safely extract the games array no matter how parseBetcode packages it
  const gamesArray = Array.isArray(decodedSlip)
    ? decodedSlip
    : (decodedSlip?.games || decodedSlip?.decodedSlip?.games || []);

  if (gamesArray.length === 0) {
    throw new Error(`Cannot generate code for ${target}. The source betslip contains no readable games.`);
  }

  // --- THIS IS WHERE THE TRANSLATION HAPPENS ---
  if (target === 'bet9ja') {
    // For a fully productionized version, you would use a headless script or target api
    // to search Bet9ja for each game in `gamesArray`, select the outcomes, and click 'Book'
    
    console.log(`Matching ${gamesArray.length} games onto Bet9ja systems...`);
    
    // For now, return a clean mock success string demonstrating the pipeline path
    // We will build out the automated destination bookie collectors next!
    return `B9J-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  }

  // Fallback mock if target implementation is pending
  return `${target.toUpperCase()}-NEWCODE777`;
};

export const supportedBookieList = () => supportedBookies;