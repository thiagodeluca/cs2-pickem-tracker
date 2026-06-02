const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 8080;
const HLTV_EVENT = 'https://www.hltv.org/events/9028/iem-cologne-major-2026-stage-1';
const HLTV_RESULTS = 'https://www.hltv.org/results?event=9028';
const HLTV_MATCHES = 'https://www.hltv.org/major/matches';

const fallbackTeams = [
  { id:'b8', hltvId:11241, slug:'b8', logo:null, name:'B8', country:'UA', aliases:['B8'] },
  { id:'tyloo', hltvId:4863, slug:'tyloo', logo:null, name:'TYLOO', country:'CN', aliases:['TYLOO'] },
  { id:'mibr', hltvId:9215, slug:'mibr', logo:null, name:'MIBR', country:'BR', aliases:['MIBR'] },
  { id:'thunder', hltvId:13486, slug:'thunder-downunder', logo:null, name:'THUNDER dOWNUNDER', country:'AU', aliases:['THUNDER dOWNUNDER','THUNDER DOWNUNDER','TALON'] },
  { id:'betboom', hltvId:12394, slug:'betboom', logo:null, name:'BetBoom', country:'RU', aliases:['BetBoom','BetBoom Team'] },
  { id:'gaimin', hltvId:11571, slug:'gaimin-gladiators', logo:null, name:'Gaimin Gladiators', country:'CA', aliases:['Gaimin Gladiators'] },
  { id:'gamerlegion', hltvId:9928, slug:'gamerlegion', logo:null, name:'GamerLegion', country:'EU', aliases:['GamerLegion'] },
  { id:'nrg', hltvId:6673, slug:'nrg', logo:null, name:'NRG', country:'US', aliases:['NRG'] },
  { id:'heroic', hltvId:7175, slug:'heroic', logo:null, name:'HEROIC', country:'NO', aliases:['HEROIC','Heroic'] },
  { id:'sharks', hltvId:8113, slug:'sharks', logo:null, name:'Sharks', country:'BR', aliases:['Sharks'] },
  { id:'sinners', hltvId:10577, slug:'sinners', logo:null, name:'SINNERS', country:'CZ', aliases:['SINNERS','Sinners'] },
  { id:'flyquest', hltvId:12774, slug:'flyquest', logo:null, name:'FlyQuest', country:'AU', aliases:['FlyQuest'] },
  { id:'m80', hltvId:12376, slug:'m80', logo:null, name:'M80', country:'US', aliases:['M80'] },
  { id:'lynnvision', hltvId:8840, slug:'lynn-vision', logo:null, name:'Lynn Vision', country:'CN', aliases:['Lynn Vision','Lynn Vision Gaming'] },
  { id:'big', hltvId:7532, slug:'big', logo:null, name:'BIG', country:'DE', aliases:['BIG'] },
  { id:'liquid', hltvId:5973, slug:'liquid', logo:null, name:'Liquid', country:'US', aliases:['Liquid','Team Liquid'] }
];

const fallbackUpcoming = [
  { a:'B8', b:'M80', startsAt:'2026-06-02T17:00:00-03:00', dateText:'02/06 17:00', round:'2-0' },
  { a:'MIBR', b:'Lynn Vision', startsAt:'2026-06-02T18:00:00-03:00', dateText:'02/06 18:00', round:'1-1' },
  { a:'HEROIC', b:'BIG', startsAt:'2026-06-02T19:00:00-03:00', dateText:'02/06 19:00', round:'0-2' }
];

const fallbackMatches = [
  { a:'B8', b:'TYLOO', scoreA:13, scoreB:6, map:'Mirage', round:'Swiss Round 1', status:'finished' },
  { a:'MIBR', b:'THUNDER dOWNUNDER', scoreA:6, scoreB:13, map:'Inferno', round:'Swiss Round 1', status:'finished' },
  { a:'BetBoom', b:'Gaimin Gladiators', scoreA:13, scoreB:4, map:'Dust2', round:'Swiss Round 1', status:'finished' },
  { a:'GamerLegion', b:'NRG', scoreA:13, scoreB:10, map:'Inferno', round:'Swiss Round 1', status:'finished' },
  { a:'HEROIC', b:'Sharks', scoreA:10, scoreB:13, map:'Nuke', round:'Swiss Round 1', status:'finished' },
  { a:'SINNERS', b:'FlyQuest', scoreA:14, scoreB:16, map:'Ancient', round:'Swiss Round 1', status:'finished' },
  { a:'M80', b:'Lynn Vision', scoreA:13, scoreB:8, map:'Inferno', round:'Swiss Round 1', status:'finished' },
  { a:'BIG', b:'Liquid', scoreA:10, scoreB:13, map:'Nuke', round:'Swiss Round 1', status:'finished' }
];

function send(res, status, body, type='application/json') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
  res.end(body);
}
function normalize(s) { return String(s||'').toLowerCase().replace(/&amp;/g,'&').replace(/[^a-z0-9]+/g,' ').trim(); }
function stripTags(s) { return String(s||'').replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<style[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim(); }
async function fetchText(url, timeoutMs = 9000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      signal: controller.signal,
      headers: {
        'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
        'accept-language':'en-US,en;q=0.9',
        'accept':'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'referer':'https://www.hltv.org/'
      }
    });
    if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
    return await r.text();
  } finally {
    clearTimeout(timer);
  }
}

const logoCache = new Map();
function hltvTeamUrl(team) {
  return `https://www.hltv.org/team/${team.hltvId}/${team.slug}`;
}
function normalizeLogoUrl(src) {
  if (!src) return null;
  src = src.replace(/&amp;/g, '&').trim();
  if (src.startsWith('//')) src = 'https:' + src;
  if (src.startsWith('/')) src = 'https://www.hltv.org' + src;
  return src;
}
function extractHltvLogo(html) {
  const patterns = [
    /https:\/\/img-cdn\.hltv\.org\/teamlogo\/[^"'\s<>]+/i,
    /src=["']([^"']*\/teamlogo\/[^"']+)["']/i,
    /srcset=["']([^"']*\/teamlogo\/[^"'\s,]+)[^"']*["']/i
  ];
  for (const re of patterns) {
    const m = html.match(re);
    const raw = m && (m[1] || m[0]);
    if (raw) return normalizeLogoUrl(raw.split(' ')[0]);
  }
  return null;
}
async function getHltvLogo(team) {
  const cached = logoCache.get(team.id);
  const now = Date.now();
  if (cached && now - cached.at < 1000 * 60 * 60 * 6) return cached.url;
  const html = await fetchText(hltvTeamUrl(team), 7000);
  const url = extractHltvLogo(html);
  if (!url) throw new Error(`Logo not found for ${team.name}`);
  logoCache.set(team.id, { url, at: now });
  return url;
}
async function getAllHltvLogos() {
  const entries = await Promise.allSettled(fallbackTeams.map(async (team) => [team.id, await getHltvLogo(team)]));
  const logos = {};
  for (const item of entries) {
    if (item.status === 'fulfilled') logos[item.value[0]] = item.value[1];
  }
  return logos;
}
function teamByName(name) {
  const n = normalize(name);
  return fallbackTeams.find(t => [t.name, ...(t.aliases||[])].some(a => normalize(a) === n))
      || fallbackTeams.find(t => n.includes(normalize(t.name)) || normalize(t.name).includes(n));
}
function parseLogos(html) {
  const logos = {};
  for (const t of fallbackTeams) {
    const names = [t.name, ...(t.aliases||[])].map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    for (const nm of names) {
      const re = new RegExp(`<img[^>]+(?:alt|title)=["']${nm}["'][^>]+src=["']([^"']+)["']|<img[^>]+src=["']([^"']+)["'][^>]+(?:alt|title)=["']${nm}["']`, 'i');
      const m = html.match(re);
      if (m) {
        let src = m[1] || m[2];
        if (src.startsWith('//')) src = 'https:' + src;
        if (src.startsWith('/')) src = 'https://www.hltv.org' + src;
        logos[t.id] = src;
        break;
      }
    }
  }
  return logos;
}
function parseUpcoming(html) {
  const text = stripTags(html);
  const items = [];
  const names = fallbackTeams.flatMap(t => [t.name, ...(t.aliases||[])]).sort((a,b)=>b.length-a.length).map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const namePattern = `(${names.join('|')})`;
  const re = new RegExp(`${namePattern}\s+(?:vs|v|-)\s+${namePattern}`, 'gi');
  let m; const seen = new Set();
  while ((m = re.exec(text)) !== null && items.length < 12) {
    const a = teamByName(m[1]); const b = teamByName(m[2]);
    if (!a || !b || a.id === b.id) continue;
    const key = [a.id,b.id].sort().join('-');
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ a:a.name, b:b.name, startsAt:null, dateText:'Horário na HLTV', round:'Próximo jogo' });
  }
  return items;
}

function parseResults(html) {
  const text = stripTags(html);
  const matches = [];
  const names = fallbackTeams.flatMap(t => [t.name, ...(t.aliases||[])]).sort((a,b)=>b.length-a.length).map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const namePattern = `(${names.join('|')})`;
  const re = new RegExp(`${namePattern}\\s+(\\d{1,2})\\s*[:\\-]\\s*(\\d{1,2})\\s+${namePattern}`, 'gi');
  let m;
  const seen = new Set();
  while ((m = re.exec(text)) !== null) {
    const a = teamByName(m[1]); const b = teamByName(m[4]);
    if (!a || !b || a.id === b.id) continue;
    const scoreA = Number(m[2]); const scoreB = Number(m[3]);
    const key = [a.id,b.id,scoreA,scoreB].join('-');
    if (seen.has(key)) continue;
    seen.add(key);
    matches.push({ a:a.name, b:b.name, scoreA, scoreB, map:'', round:'HLTV', status:'finished' });
  }
  return matches;
}
function standingsFromMatches(matches) {
  const st = Object.fromEntries(fallbackTeams.map(t => [t.id, { id:t.id, name:t.name, wins:0, losses:0, status:'alive', logo:null, country:t.country }]));
  for (const m of matches) {
    const a = teamByName(m.a), b = teamByName(m.b);
    if (!a || !b || m.scoreA === m.scoreB) continue;
    if (m.scoreA > m.scoreB) { st[a.id].wins++; st[b.id].losses++; }
    else { st[b.id].wins++; st[a.id].losses++; }
  }
  for (const s of Object.values(st)) {
    if (s.wins >= 3) s.status = 'qualified';
    if (s.losses >= 3) s.status = 'eliminated';
  }
  return st;
}
async function liveData() {
  let source = 'fallback';
  let logos = {};
  let matches = fallbackMatches;
  let schedule = fallbackUpcoming;
  const errors = [];
  try {
    const [eventHtml, resultsHtml, matchesHtml] = await Promise.all([fetchText(HLTV_EVENT), fetchText(HLTV_RESULTS), fetchText(HLTV_MATCHES).catch(()=> '')]);
    source = 'hltv';
    const eventLogos = parseLogos(eventHtml + resultsHtml);
    logos = { ...eventLogos, ...(await getAllHltvLogos()) };
    const parsed = parseResults(resultsHtml);
    if (parsed.length) matches = parsed;
    const upcoming = matchesHtml ? parseUpcoming(matchesHtml) : [];
    if (upcoming.length) schedule = upcoming;
  } catch (e) {
    errors.push(e.message);
    try { logos = await getAllHltvLogos(); } catch (logoError) { errors.push(logoError.message); }
  }
  const standings = standingsFromMatches(matches);
  for (const id in standings) {
    const base = fallbackTeams.find(t => t.id === id);
    standings[id].logo = logos[id] || null;
  }
  return { ok:true, source, updatedAt:new Date().toISOString(), event:{ name:'IEM Cologne Major 2026 — Stage 1', hltv:HLTV_EVENT }, teams:fallbackTeams.map(t => ({...t, logo:standings[t.id].logo})), matches, schedule, standings:Object.values(standings), errors };
}

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, `http://${req.headers.host}`);
    if (u.pathname.startsWith('/api/logo/')) {
      const id = u.pathname.split('/').pop();
      const team = fallbackTeams.find(t => t.id === id);
      if (!team) return send(res, 404, 'Team not found', 'text/plain');
      try {
        const logo = await getHltvLogo(team);
        res.writeHead(302, { Location: logo, 'Cache-Control': 'public, max-age=21600' });
        return res.end();
      } catch (e) {
        return send(res, 404, `HLTV logo not available for ${team.name}`, 'text/plain');
      }
    }
    if (u.pathname === '/api/live') return send(res, 200, JSON.stringify(await liveData()));
    if (u.pathname === '/api/health') return send(res, 200, JSON.stringify({ok:true}));
    let filePath = path.join(__dirname, 'public', u.pathname === '/' ? 'index.html' : decodeURIComponent(u.pathname));
    const base = path.join(__dirname, 'public');
    if (!filePath.startsWith(base)) return send(res, 403, 'Forbidden', 'text/plain');
    fs.readFile(filePath, (err, data) => {
      if (err) return send(res, 404, 'Not found', 'text/plain');
      const ext = path.extname(filePath).toLowerCase();
      const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.svg':'image/svg+xml'};
      send(res, 200, data, types[ext] || 'application/octet-stream');
    });
  } catch(e) { send(res, 500, JSON.stringify({ok:false,error:e.message})); }
});
server.listen(PORT, () => console.log(`CS2 Pickem Live Tracker: http://localhost:${PORT}`));
