const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 8080;
const HLTV_EVENT = 'https://www.hltv.org/events/9028/iem-cologne-major-2026-stage-1';
const HLTV_RESULTS = 'https://www.hltv.org/results?event=9028';
const HLTV_MATCHES = 'https://www.hltv.org/major/matches';

const fallbackTeams = [
  { id:'b8', logo:'/assets/logos/b8.svg', name:'B8', country:'UA', aliases:['B8'] },
  { id:'tyloo', logo:'/assets/logos/tyloo.svg', name:'TYLOO', country:'CN', aliases:['TYLOO'] },
  { id:'mibr', logo:'/assets/logos/mibr.svg', name:'MIBR', country:'BR', aliases:['MIBR'] },
  { id:'thunder', logo:'/assets/logos/thunder.svg', name:'THUNDER dOWNUNDER', country:'AU', aliases:['THUNDER dOWNUNDER','THUNDER DOWNUNDER','TALON'] },
  { id:'betboom', logo:'/assets/logos/betboom.svg', name:'BetBoom', country:'RU', aliases:['BetBoom','BetBoom Team'] },
  { id:'gaimin', logo:'/assets/logos/gaimin.svg', name:'Gaimin Gladiators', country:'CA', aliases:['Gaimin Gladiators'] },
  { id:'gamerlegion', logo:'/assets/logos/gamerlegion.svg', name:'GamerLegion', country:'EU', aliases:['GamerLegion'] },
  { id:'nrg', logo:'/assets/logos/nrg.svg', name:'NRG', country:'US', aliases:['NRG'] },
  { id:'heroic', logo:'/assets/logos/heroic.svg', name:'HEROIC', country:'NO', aliases:['HEROIC','Heroic'] },
  { id:'sharks', logo:'/assets/logos/sharks.svg', name:'Sharks', country:'BR', aliases:['Sharks'] },
  { id:'sinners', logo:'/assets/logos/sinners.svg', name:'SINNERS', country:'CZ', aliases:['SINNERS','Sinners'] },
  { id:'flyquest', logo:'/assets/logos/flyquest.svg', name:'FlyQuest', country:'AU', aliases:['FlyQuest'] },
  { id:'m80', logo:'/assets/logos/m80.svg', name:'M80', country:'US', aliases:['M80'] },
  { id:'lynnvision', logo:'/assets/logos/lynnvision.svg', name:'Lynn Vision', country:'CN', aliases:['Lynn Vision','Lynn Vision Gaming'] },
  { id:'big', logo:'/assets/logos/big.svg', name:'BIG', country:'DE', aliases:['BIG'] },
  { id:'liquid', logo:'/assets/logos/liquid.svg', name:'Liquid', country:'US', aliases:['Liquid','Team Liquid'] }
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
async function fetchText(url) {
  const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36', 'accept-language':'en-US,en;q=0.9' } });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return await r.text();
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
    logos = parseLogos(eventHtml + resultsHtml);
    const parsed = parseResults(resultsHtml);
    if (parsed.length) matches = parsed;
    const upcoming = matchesHtml ? parseUpcoming(matchesHtml) : [];
    if (upcoming.length) schedule = upcoming;
  } catch (e) { errors.push(e.message); }
  const standings = standingsFromMatches(matches);
  for (const id in standings) {
    const base = fallbackTeams.find(t => t.id === id);
    standings[id].logo = logos[id] || base?.logo || null;
  }
  return { ok:true, source, updatedAt:new Date().toISOString(), event:{ name:'IEM Cologne Major 2026 — Stage 1', hltv:HLTV_EVENT }, teams:fallbackTeams.map(t => ({...t, logo:standings[t.id].logo})), matches, schedule, standings:Object.values(standings), errors };
}

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, `http://${req.headers.host}`);
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
