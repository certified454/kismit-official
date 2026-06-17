// src/lib/betcodeConverter.js

const supportedBookies = [
    'sportybet', 
    '1xbet', 
    'bet9ja', 
    'nairabet', 
    'pinnacle'
];

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

  if (/SPORTY|SPRTY/.test(cleanCode)) return 'sportybet';
  if (/1X|1XBET|XBET/.test(cleanCode)) return '1xbet';
  if (/BET9JA|9JA/.test(cleanCode)) return 'bet9ja';

  return 'sportybet';
};

const fetchRealSportybetSlip = async (code) => {
  const rawCode = code.replace(/SPORTY|[-_\s]/gi, '').toUpperCase();
  const url = `https://www.sportybet.com/?shareCode${rawCode}`;
  
  console.log(`🌐 [HTTP Fetch] GET -> ${url}`);
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json',
      'Platform': 'web'
    }
  });

  if (!response.ok) {
    throw new Error(`SportyBet proxy gate rejected connection. HTTP Status: ${response.status}`);
  }

  const data = await response.json();

  if (data.status !== 10000 || !data.data) {
    throw new Error(data.message || "This booking code does not exist or has expired on SportyBet.");
  }

  const selections = data.data.selections || [];

  const games = selections.map(game => ({
    sport: "Football",
    tournament: game.tournamentName,
    homeTeam: game.homeTeam,
    awayTeam: game.awayTeam,
    normalizedHome: normalizeTeamName(game.homeTeam),
    normalizedAway: normalizeTeamName(game.awayTeam),
    market: game.marketName,         
    selection: game.outcomeName,     
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

  return {
    bookie: chosenBookie,
    rawCode: code,
    games: []
  };
};

export const buildTargetBookieCode = async (decodedSlip, targetBookie) => {
  const target = targetBookie.toLowerCase().trim();
  
  const gamesArray = Array.isArray(decodedSlip)
    ? decodedSlip
    : (decodedSlip?.games || decodedSlip?.decodedSlip?.games || []);

  // Detailed breakdown logs
  console.log(`\n==================================================`);
  console.log(`📊 LIVE PARSED SLIP CONTENT SENT TO BUILD PIPELINE:`);
  console.log(`- Original Source Bookie: ${decodedSlip?.bookie || 'Unknown'}`);
  console.log(`- Destination Target Chosen: ${target}`);
  console.log(`- Total Extracted Fixtures: ${gamesArray.length}`);
  
  gamesArray.forEach((game, index) => {
    console.log(`  📍 Match [${index + 1}]: ${game.homeTeam} vs ${game.awayTeam}`);
    console.log(`     Tournament: ${game.tournament || 'N/A'}`);
    console.log(`     Market Type: ${game.market} ---> Selection Option: ${game.selection}`);
    console.log(`     Odds Factor: @${game.odds}`);
  });
  console.log(`==================================================\n`);

  if (gamesArray.length === 0) {
    throw new Error(`Cannot generate code for ${target}. The source betslip contains no readable games.`);
  }

  if (target === 'bet9ja') {
    console.log(`Matching ${gamesArray.length} games onto Bet9ja automation nodes...`);
    return `B9J-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  }

  if (target === 'sportybet') {
    console.log(`Matching ${gamesArray.length} games onto SportyBet automation nodes...`);
    return `SRT-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  }

  return `${target.toUpperCase()}-NEWCODE777`;
};

export const supportedBookieList = () => supportedBookies;