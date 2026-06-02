const PHASES = [
  { id:'stage1', label:'1ª Fase', unlockedAt:'2026-06-02T00:00:00-03:00' },
  { id:'stage2', label:'2ª Fase', unlockedAt:'2026-06-05T10:00:00-03:00' },
  { id:'stage3', label:'3ª Fase', unlockedAt:'2026-06-08T10:00:00-03:00' },
  { id:'playoffs', label:'Mata-mata', unlockedAt:'2026-06-12T10:00:00-03:00' }
];
const STORAGE_KEY = 'thiago.cs2.pickem.pandascore.v1';
const SLOT_LIMITS = { pool: 999, threeZero: 2, advance: 6, zeroThree: 2 };
const state = {
  phase:'stage1',
  api:null,
  teams:[],
  standings:[],
  picks:{ threeZero:[], advance:[], zeroThree:[] },
  dragging:null
};
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
function normalizeId(v){ return String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,''); }
function getRecord(teamId){ return state.standings.find(s => s.id === teamId) || { wins:0, losses:0, pending:0 }; }
function getTeam(teamId){ return state.teams.find(t => t.id === teamId) || { id:teamId, name:teamId, image:null }; }
function initials(name){ return String(name||'?').split(/\s+/).filter(Boolean).slice(0,2).map(p=>p[0]).join('').toUpperCase(); }
function fmtTime(iso){
  if(!iso) return '--';
  const d = new Date(iso);
  if(Number.isNaN(d.getTime())) return '--';
  return d.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
}
function save(){ localStorage.setItem(STORAGE_KEY, JSON.stringify({ picks:state.picks, savedAt:new Date().toISOString() })); }
function load(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return;
    const parsed = JSON.parse(raw);
    if(parsed?.picks) state.picks = { threeZero:[], advance:[], zeroThree:[], ...parsed.picks };
  }catch(e){ console.warn(e); }
}
function allPicked(){ return new Set([...state.picks.threeZero, ...state.picks.advance, ...state.picks.zeroThree]); }
function zoneOf(teamId){
  for(const zone of ['threeZero','advance','zeroThree']) if(state.picks[zone].includes(teamId)) return zone;
  return 'pool';
}
function removeFromAll(teamId){
  for(const zone of ['threeZero','advance','zeroThree']) state.picks[zone] = state.picks[zone].filter(id => id !== teamId);
}
function addToZone(teamId, zone){
  removeFromAll(teamId);
  if(zone !== 'pool'){
    if(state.picks[zone].length >= SLOT_LIMITS[zone]) return false;
    state.picks[zone].push(teamId);
  }
  save();
  render();
  return true;
}
function pickStatus(teamId, zone){
  const r = getRecord(teamId);
  if(zone === 'threeZero'){
    if(r.wins >= 3 && r.losses === 0) return 'ok';
    if(r.losses > 0 || r.losses >= 3) return 'dead';
    return 'live';
  }
  if(zone === 'advance'){
    if(r.wins >= 3) return 'ok';
    if(r.losses >= 3) return 'dead';
    return 'live';
  }
  if(zone === 'zeroThree'){
    if(r.losses >= 3 && r.wins === 0) return 'ok';
    if(r.wins > 0 || r.wins >= 3) return 'dead';
    return 'live';
  }
  return 'pending';
}
function statusLabel(status){ return ({ ok:'Certo', live:'Com chance', dead:'Sem chance', pending:'Pendente' })[status] || 'Pendente'; }
function teamCard(team, zone='pool'){
  const r = getRecord(team.id);
  const status = zone === 'pool' ? 'pending' : pickStatus(team.id, zone);
  const logo = team.image ? `<img src="${team.image}" alt="${team.name}" loading="lazy" onerror="this.remove();this.parentElement.textContent='${initials(team.name)}'">` : initials(team.name);
  return `<article class="team-card" draggable="true" data-team="${team.id}">
    <div class="logo">${logo}</div>
    <div><div class="name">${team.name}</div><div class="record">${r.wins}-${r.losses}${r.pending ? ` • ${r.pending} pend.` : ''}</div></div>
    <span class="badge ${status}">${statusLabel(status)}</span>
  </article>`;
}
function placeholder(){ return `<div class="placeholder">Arraste aqui</div>`; }
function renderTabs(){
  const now = Date.now();
  $('#phaseTabs').innerHTML = PHASES.map(p => {
    const unlocked = Date.parse(p.unlockedAt) <= now;
    return `<button class="tab ${state.phase===p.id?'active':''} ${unlocked?'':'locked'}" data-phase="${p.id}">${p.label}${unlocked?'':' 🔒'}</button>`;
  }).join('');
  $$('#phaseTabs .tab').forEach(btn => btn.addEventListener('click', () => {
    const phase = PHASES.find(p => p.id === btn.dataset.phase);
    if(Date.parse(phase.unlockedAt) > Date.now()) return showPhaseLocked(phase);
    state.phase = phase.id; renderTabs();
  }));
}
function showPhaseLocked(phase){
  $('#dialogTitle').textContent = `${phase.label} bloqueada`;
  $('#dialogText').textContent = `Esta fase será liberada em ${fmtTime(phase.unlockedAt)}.`;
  $('#phaseDialog').showModal();
}
function renderPool(){
  const picked = allPicked();
  const pool = state.teams.filter(t => !picked.has(t.id));
  $('#teamPool').innerHTML = pool.length ? pool.map(t => teamCard(t,'pool')).join('') : `<div class="empty">Todos os times já foram usados nos seus palpites.</div>`;
}
function renderZone(zone){
  const el = document.querySelector(`[data-zone="${zone}"]`);
  const cards = state.picks[zone].map(id => teamCard(getTeam(id), zone));
  const missing = SLOT_LIMITS[zone] - cards.length;
  el.innerHTML = cards.join('') + Array.from({length:Math.max(0,missing)}, placeholder).join('');
}
function renderMetrics(){
  const picks = [
    ...state.picks.threeZero.map(id => [id,'threeZero']),
    ...state.picks.advance.map(id => [id,'advance']),
    ...state.picks.zeroThree.map(id => [id,'zeroThree'])
  ];
  let ok=0, live=0, dead=0;
  for(const [id,zone] of picks){
    const s = pickStatus(id,zone);
    if(s==='ok') ok++; else if(s==='dead') dead++; else live++;
  }
  $('#mCorrect').textContent = ok;
  $('#mAlive').textContent = live;
  $('#mDead').textContent = dead;
  $('#mUpdated').textContent = state.api?.updatedAt ? new Date(state.api.updatedAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : '--';
}
function renderStandings(){
  $('#sourceText').textContent = state.api?.source === 'PandaScore'
    ? 'Fonte: PandaScore API. Atualiza pelo backend.'
    : `Fonte: fallback local${state.api?.apiError ? ' — API indisponível' : ''}.`;
  $('#standings').innerHTML = state.standings.map(s => {
    const team = getTeam(s.id);
    const logo = team.image ? `<img src="${team.image}" alt="${team.name}" loading="lazy" onerror="this.remove();this.parentElement.textContent='${initials(team.name)}'">` : initials(team.name);
    return `<div class="standing-row"><div class="logo">${logo}</div><strong>${team.name}</strong><b>${s.wins}-${s.losses}</b></div>`;
  }).join('') || `<div class="empty">Nenhum resultado ainda.</div>`;
}
function renderCalendar(){
  const games = state.api?.upcoming || [];
  $('#calendar').innerHTML = games.length ? games.map(g => `<article class="game-row"><div><div class="game-teams"><strong>${g.a}</strong><span>vs</span><strong>${g.b}</strong></div><div class="game-meta">${fmtTime(g.startsAt)}${g.round ? ` • ${g.round}` : ''}</div></div><span class="badge live">${g.status || 'agendado'}</span></article>`).join('') : `<div class="empty">Sem próximos jogos encontrados na API.</div>`;
}
function wireDrag(){
  $$('.team-card').forEach(card => {
    card.addEventListener('dragstart', ev => {
      state.dragging = card.dataset.team;
      card.classList.add('dragging');
      ev.dataTransfer.setData('text/plain', state.dragging);
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
  });
  $$('.dropzone').forEach(zone => {
    zone.addEventListener('dragover', ev => { ev.preventDefault(); zone.classList.add('over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('over'));
    zone.addEventListener('drop', ev => {
      ev.preventDefault(); zone.classList.remove('over');
      const teamId = ev.dataTransfer.getData('text/plain') || state.dragging;
      const targetZone = zone.dataset.zone;
      if(!teamId) return;
      const ok = addToZone(teamId, targetZone);
      if(!ok) pulse(zone);
    });
  });
}
function pulse(el){ el.animate([{transform:'scale(1)'},{transform:'scale(.985)'},{transform:'scale(1)'}],{duration:160}); }
function render(){
  renderTabs(); renderPool(); renderZone('threeZero'); renderZone('advance'); renderZone('zeroThree'); renderMetrics(); renderStandings(); renderCalendar(); wireDrag();
}
async function refresh(force=false){
  $('#refreshBtn').disabled = true;
  $('#refreshBtn').textContent = 'Atualizando...';
  try{
    const res = await fetch(`/api/event-state${force?'?force=1':''}`, { cache:'no-store' });
    state.api = await res.json();
    if(!state.api.ok) throw new Error(state.api.error || 'Falha na API');
    state.teams = (state.api.teams || []).map(t => ({...t, id:t.id || normalizeId(t.name)}));
    state.standings = state.api.standings || [];
    // Remove picks de time que sumiu da lista, mas mantém fallback se ID existe antigo.
    const known = new Set(state.teams.map(t => t.id));
    for(const zone of ['threeZero','advance','zeroThree']) state.picks[zone] = state.picks[zone].filter(id => known.has(id));
    save(); render();
  }catch(error){
    console.error(error);
    $('#sourceText').textContent = `Erro ao atualizar: ${error.message}`;
  }finally{
    $('#refreshBtn').disabled = false;
    $('#refreshBtn').textContent = 'Atualizar PandaScore';
  }
}
$('#refreshBtn').addEventListener('click', () => refresh(true));
$('#clearBtn').addEventListener('click', () => {
  if(confirm('Limpar seus palpites salvos neste navegador?')){
    state.picks = { threeZero:[], advance:[], zeroThree:[] };
    localStorage.removeItem(STORAGE_KEY);
    render();
  }
});
$('#closeDialog').addEventListener('click', () => $('#phaseDialog').close());
load();
render();
refresh(false);
setInterval(() => refresh(false), 60000);
