const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 8080;
const PUBLIC_DIR = path.join(__dirname, 'public');
const PANDASCORE_TOKEN = process.env.PANDASCORE_TOKEN || '';
const EVENT_NAME = process.env.EVENT_NAME || 'IEM Cologne Major 2026';
const EVENT_KEYWORDS = (process.env.EVENT_KEYWORDS || 'iem,cologne,major')
  .split(',')
  .map(s => s.trim().toLowerCase())
  .filter(Boolean);
const EVENT_START = process.env.EVENT_START || '2026-06-02T00:00:00Z';
const EVENT_END = process.env.EVENT_END || '2026-06-09T23:59:59Z';
const CACHE_SECONDS = Number(process.env.CACHE_SECONDS || 45);
const API_BASE = 'https://api.pandascore.co';

const fallbackTeams = [
  { id:'b8', pandaId:null, name:'B8', aliases:['B8'] },
  { id:'tyloo', pandaId:null, name:'TYLOO', aliases:['TYLOO'] },
  { id:'mibr', pandaId:null, name:'MIBR', aliases:['MIBR'] },
  { id:'thunder', pandaId:null, name:'THUNDER dOWNUNDER', aliases:['THUNDER dOWNUNDER','Thunder dOWNUNDER','Talon','TALON'] },
  { id:'betboom', pandaId:null, name:'BetBoom', aliases:['BetBoom','BetBoom Team'] },
  { id:'gaimin', pandaId:null, name:'Gaimin Gladiators', aliases:['Gaimin Gladiators'] },
  { id:'gamerlegion', pandaId:null, name:'GamerLegion', aliases:['GamerLegion'] },
  { id:'nrg', pandaId:null, name:'NRG', aliases:['NRG'] },
  { id:'heroic', pandaId:null, name:'HEROIC', aliases:['HEROIC','Heroic'] },
  { id:'sharks', pandaId:null, name:'Sharks', aliases:['Sharks','Sharks Esports'] },
  { id:'sinners', pandaId:null, name:'SINNERS', aliases:['SINNERS','Sinners'] },
  { id:'flyquest', pandaId:null, name:'FlyQuest', aliases:['FlyQuest'] },
  { id:'m80', pandaId:null, name:'M80', aliases:['M80'] },
  { id:'lynnvision', pandaId:null, name:'Lynn Vision', aliases:['Lynn Vision','Lynn Vision Gaming'] },
  { id:'big', pandaId:null, name:'BIG', aliases:['BIG'] },
  { id:'liquid', pandaId:null, name:'Liquid', aliases:['Liquid','Team Liquid'] }
];

const fallbackMatches = [
  { id:'fb-1', a:'B8', b:'TYLOO', status:'finished', winner:'B8', scoreA:1, scoreB:0, startsAt:'2026-06-02T11:00:00Z', round:'Round 1', source:'fallback' },
  { id:'fb-2', a:'MIBR', b:'THUNDER dOWNUNDER', status:'finished', winner:'THUNDER dOWNUNDER', scoreA:0, scoreB:1, startsAt:'2026-06-02T11:00:00Z', round:'Round 1', source:'fallback' },
  { id:'fb-3', a:'BetBoom', b:'Gaimin Gladiators', status:'finished', winner:'BetBoom', scoreA:1, scoreB:0, startsAt:'2026-06-02T12:00:00Z', round:'Round 1', source:'fallback' },
  { id:'fb-4', a:'GamerLegion', b:'NRG', status:'finished', winner:'GamerLegion', scoreA:1, scoreB:0, startsAt:'2026-06-02T12:00:00Z', round:'Round 1', source:'fallback' },
  { id:'fb-5', a:'HEROIC', b:'Sharks', status:'finished', winner:'Sharks', scoreA:0, scoreB:1, startsAt:'2026-06-02T13:00:00Z', round:'Round 1', source:'fallback' },
  { id:'fb-6', a:'SINNERS', b:'FlyQuest', status:'finished', winner:'FlyQuest', scoreA:0, scoreB:1, startsAt:'2026-06-02T13:00:00Z', round:'Round 1', source:'fallback' },
  { id:'fb-7', a:'M80', b:'Lynn Vision', status:'finished', winner:'M80', scoreA:1, scoreB:0, startsAt:'2026-06-02T14:00:00Z', round:'Round 1', source:'fallback' },
  { id:'fb-8', a:'BIG', b:'Liquid', status:'finished', winner:'Liquid', scoreA:0, scoreB:1, startsAt:'2026-06-02T14:00:00Z', round:'Round 1', source:'fallback' }
];

const fallbackUpcoming = [
  { id:'up-1', a:'B8', b:'M80', status:'scheduled', startsAt:'2026-06-02T20:00:00Z', round:'2-0' },
  { id:'up-2', a:'MIBR', b:'Lynn Vision', status:'scheduled', startsAt:'2026-06-02T21:00:00Z', round:'1-1' },
  { id:'up-3', a:'HEROIC', b:'BIG', status:'scheduled', startsAt:'2026-06-02T22:00:00Z', round:'0-2' }
];

let cache = { at: 0, data: null, error: null };

function slugify(value) {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
function compact(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
function teamKey(name) {
  const n = compact(name);
  const found = fallbackTeams.find(t => [t.name, ...(t.aliases || [])].some(a => compact(a) === n));
  return found?.id || slugify(name);
}
function firstDefined(...values) {
  return values.find(v => v !== undefined && v !== null && v !== '');
}
function pandaHeaders() {
  return {
    'Authorization': `Bearer ${PANDASCORE_TOKEN}`,
    'Accept': 'application/json',
    'User-Agent': 'cs2-pickem-tracker/3.0 (+render)'
  };
}
async function pandaGet(endpoint, params = {}) {
  if (!PANDASCORE_TOKEN) throw new Error('PANDASCORE_TOKEN não configurado');
  const url = new URL(API_BASE + endpoint);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, { headers: pandaHeaders(), signal: controller.signal });
    const text = await res.text();
    if (!res.ok) throw new Error(`PandaScore ${res.status}: ${text.slice(0, 240)}`);
    return JSON.parse(text);
  } finally {
    clearTimeout(timeout);
  }
}
function eventText(match) {
  return [
    match.name,
    match.slug,
    match.league?.name,
    match.league?.slug,
    match.serie?.full_name,
    match.serie?.name,
    match.serie?.slug,
    match.tournament?.name,
    match.tournament?.slug,
    ...(match.opponents || []).map(o => o?.opponent?.name)
  ].filter(Boolean).join(' ').toLowerCase();
}
function isTargetEvent(match) {
  const text = eventText(match);
  const hasEventKeyword = EVENT_KEYWORDS.length === 0 || EVENT_KEYWORDS.every(k => text.includes(k));
  const hasKnownTeam = fallbackTeams.some(t => [t.name, ...(t.aliases || [])].some(alias => text.includes(alias.toLowerCase())));
  return hasEventKeyword || (hasKnownTeam && text.includes('cologne')) || (hasKnownTeam && text.includes('major'));
}
function isWithinEventWindow(match) {
  const date = match.begin_at || match.scheduled_at || match.original_scheduled_at;
  if (!date) return true;
  const ts = Date.parse(date);
  return ts >= Date.parse(EVENT_START) - 86400000 && ts <= Date.parse(EVENT_END) + 86400000;
}
async function fetchPandaMatches() {
  const common = { per_page: '100' };
  const calls = [
    pandaGet('/csgo/matches', { ...common, sort: 'begin_at', 'range[begin_at]': `${EVENT_START},${EVENT_END}` }),
    pandaGet('/csgo/matches/running', common),
    pandaGet('/csgo/matches/upcoming', { ...common, sort: 'begin_at' }),
    pandaGet('/csgo/matches/past', { ...common, sort: '-begin_at', 'range[begin_at]': `${EVENT_START},${EVENT_END}` })
  ];
  const settled = await Promise.allSettled(calls);
  const all = [];
  const errors = [];
  for (const item of settled) {
    if (item.status === 'fulfilled' && Array.isArray(item.value)) all.push(...item.value);
    if (item.status === 'rejected') errors.push(item.reason.message);
  }
  if (!all.length && errors.length) throw new Error(errors.join(' | '));
  const unique = Array.from(new Map(all.map(m => [m.id, m])).values());
  let filtered = unique.filter(m => isWithinEventWindow(m) && isTargetEvent(m));
  if (filtered.length < 4) {
    const knownTeamMatches = unique.filter(m => isWithinEventWindow(m) && fallbackTeams.some(t => eventText(m).includes(t.name.toLowerCase())));
    if (knownTeamMatches.length > filtered.length) filtered = knownTeamMatches;
  }
  return filtered;
}
function readTeamFromOpponent(opponent) {
  const raw = opponent?.opponent || opponent;
  if (!raw || !raw.name) return null;
  const id = teamKey(raw.name);
  return {
    id,
    pandaId: raw.id || null,
    name: raw.name,
    image: raw.image_url || raw.image || null,
    acronym: raw.acronym || null
  };
}
function convertMatch(match) {
  const opponents = (match.opponents || []).map(readTeamFromOpponent).filter(Boolean);
  if (opponents.length < 2) return null;
  const [a, b] = opponents;
  const results = match.results || [];
  const scoreA = firstDefined(results.find(r => r.team_id === a.pandaId)?.score, null);
  const scoreB = firstDefined(results.find(r => r.team_id === b.pandaId)?.score, null);
  let winner = null;
  if (match.winner_id) {
    if (match.winner_id === a.pandaId) winner = a.name;
    if (match.winner_id === b.pandaId) winner = b.name;
  }
  if (!winner && Number.isFinite(Number(scoreA)) && Number.isFinite(Number(scoreB)) && scoreA !== scoreB) {
    winner = Number(scoreA) > Number(scoreB) ? a.name : b.name;
  }
  const status = ['finished', 'canceled'].includes(match.status) ? match.status : (['running', 'not_started'].includes(match.status) ? match.status : match.status || 'scheduled');
  return {
    id: String(match.id),
    a: a.name,
    b: b.name,
    teamAId: a.id,
    teamBId: b.id,
    status,
    winner,
    scoreA: scoreA ?? null,
    scoreB: scoreB ?? null,
    startsAt: match.begin_at || match.scheduled_at || match.original_scheduled_at,
    round: firstDefined(match.match_type, match.name, match.tournament?.name, match.serie?.full_name, ''),
    league: match.league?.name || '',
    serie: match.serie?.full_name || match.serie?.name || '',
    tournament: match.tournament?.name || '',
    source: 'PandaScore'
  };
}
function mergeTeams(matches) {
  const map = new Map(fallbackTeams.map(t => [t.id, { ...t, image: null }]));
  for (const m of matches) {
    for (const opp of (m.opponents || [])) {
      const t = readTeamFromOpponent(opp);
      if (!t) continue;
      const existing = map.get(t.id) || {};
      map.set(t.id, { ...existing, ...t, name: existing.name || t.name, image: t.image || existing.image || null });
    }
  }
  return Array.from(map.values()).sort((a,b) => a.name.localeCompare(b.name));
}
function calculateStandings(teams, matches) {
  const standings = new Map(teams.map(t => [t.id, { id:t.id, name:t.name, image:t.image || null, wins:0, losses:0, pending:0 }]));
  const converted = matches.map(convertMatch).filter(Boolean);
  for (const m of converted) {
    if (!standings.has(m.teamAId)) standings.set(m.teamAId, { id:m.teamAId, name:m.a, image:null, wins:0, losses:0, pending:0 });
    if (!standings.has(m.teamBId)) standings.set(m.teamBId, { id:m.teamBId, name:m.b, image:null, wins:0, losses:0, pending:0 });
    const a = standings.get(m.teamAId);
    const b = standings.get(m.teamBId);
    if (m.status === 'finished' && m.winner) {
      const winnerId = teamKey(m.winner);
      if (winnerId === m.teamAId) { a.wins++; b.losses++; }
      else if (winnerId === m.teamBId) { b.wins++; a.losses++; }
    } else if (m.status !== 'canceled') {
      a.pending++; b.pending++;
    }
  }
  return Array.from(standings.values()).sort((a,b) => b.wins - a.wins || a.losses - b.losses || a.name.localeCompare(b.name));
}
async function buildEventState(force = false) {
  const now = Date.now();
  if (!force && cache.data && now - cache.at < CACHE_SECONDS * 1000) return cache.data;
  let rawMatches = [];
  let apiError = null;
  try {
    rawMatches = await fetchPandaMatches();
  } catch (error) {
    apiError = error.message;
  }
  const usingFallback = rawMatches.length === 0;
  const teams = usingFallback ? fallbackTeams.map(t => ({ ...t, image:null })) : mergeTeams(rawMatches);
  const converted = usingFallback ? fallbackMatches : rawMatches.map(convertMatch).filter(Boolean);
  const finished = converted.filter(m => m.status === 'finished');
  const upcoming = (usingFallback ? fallbackUpcoming : converted.filter(m => m.status !== 'finished' && m.status !== 'canceled'))
    .filter(m => !m.startsAt || Date.parse(m.startsAt) >= Date.now() - 3 * 3600000)
    .sort((a,b) => Date.parse(a.startsAt || 0) - Date.parse(b.startsAt || 0))
    .slice(0, 20);
  const standings = calculateStandings(teams, usingFallback ? [] : rawMatches);
  if (usingFallback) {
    // Fallback standings from fallback converted matches.
    const map = new Map(teams.map(t => [t.id, { id:t.id, name:t.name, image:null, wins:0, losses:0, pending:0 }]));
    for (const m of fallbackMatches) {
      const aId = teamKey(m.a), bId = teamKey(m.b), wId = teamKey(m.winner);
      if (wId === aId) { map.get(aId).wins++; map.get(bId).losses++; }
      if (wId === bId) { map.get(bId).wins++; map.get(aId).losses++; }
    }
    standings.splice(0, standings.length, ...Array.from(map.values()).sort((a,b)=>b.wins-a.wins||a.losses-b.losses||a.name.localeCompare(b.name)));
  }
  const data = {
    ok: true,
    event: { name: EVENT_NAME, keywords: EVENT_KEYWORDS, start: EVENT_START, end: EVENT_END },
    source: usingFallback ? 'fallback' : 'PandaScore',
    apiError,
    updatedAt: new Date().toISOString(),
    cacheSeconds: CACHE_SECONDS,
    teams,
    standings,
    matches: finished.sort((a,b) => Date.parse(b.startsAt || 0) - Date.parse(a.startsAt || 0)),
    upcoming
  };
  cache = { at: now, data, error: apiError };
  return data;
}
function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(body));
}
function staticFile(res, pathname) {
  const clean = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.join(PUBLIC_DIR, decodeURIComponent(clean));
  if (!filePath.startsWith(PUBLIC_DIR)) return false;
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return false;
  const ext = path.extname(filePath).toLowerCase();
  const types = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp' };
  res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=3600' });
  fs.createReadStream(filePath).pipe(res);
  return true;
}
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === '/api/health') return json(res, 200, { ok:true, hasToken: Boolean(PANDASCORE_TOKEN), event: EVENT_NAME });
    if (url.pathname === '/api/event-state' || url.pathname === '/api/live') {
      const force = url.searchParams.get('force') === '1';
      const data = await buildEventState(force);
      return json(res, 200, data);
    }
    if (url.pathname.startsWith('/api/logo/')) {
      const id = decodeURIComponent(url.pathname.replace('/api/logo/', ''));
      const state = await buildEventState(false);
      const team = state.teams.find(t => t.id === id || slugify(t.name) === id);
      if (team?.image) {
        res.writeHead(302, { Location: team.image, 'Cache-Control': 'public, max-age=86400' });
        return res.end();
      }
      return json(res, 404, { ok:false, error:'logo-not-found' });
    }
    if (staticFile(res, url.pathname)) return;
    json(res, 404, { ok:false, error:'not-found' });
  } catch (error) {
    console.error(error);
    json(res, 500, { ok:false, error:error.message });
  }
});
server.listen(PORT, () => console.log(`CS2 Pick'em PandaScore Tracker running on http://localhost:${PORT}`));
