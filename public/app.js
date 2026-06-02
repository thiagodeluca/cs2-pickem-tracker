const TEAMS = [
  ['b8','B8','UA'],['tyloo','TYLOO','CN'],['mibr','MIBR','BR'],['thunder','THUNDER dOWNUNDER','AU'],['betboom','BetBoom','RU'],['gaimin','Gaimin Gladiators','CA'],['gamerlegion','GamerLegion','EU'],['nrg','NRG','US'],['heroic','HEROIC','NO'],['sharks','Sharks','BR'],['sinners','SINNERS','CZ'],['flyquest','FlyQuest','AU'],['m80','M80','US'],['lynnvision','Lynn Vision','CN'],['big','BIG','DE'],['liquid','Liquid','US']
].map(([id,name,country])=>({id,name,country, logo:`/api/logo/${id}`}));

const STORAGE_KEY = 'thiago-cs2-pickem:v6';
const emptyPicks = () => ({
  phase: 'stage1',
  stages: {
    stage1: { threeZero: [], advance: [], zeroThree: [], pool: TEAMS.map(t=>t.id) },
    stage2: { threeZero: [], advance: [], zeroThree: [], pool: [] },
    stage3: { threeZero: [], advance: [], zeroThree: [], pool: [] },
    playoffs: { champions: [], finalists: [], semifinalists: [], pool: [] }
  }
});

const PHASES = [
  { id:'stage1', label:'1ª FASE', title:'1ª Fase', subtitle:'Arraste 10 times: 2 para 3x0, 6 para classificados e 2 para 0x3.', unlockAt:'2026-06-02T00:00:00-03:00' },
  { id:'stage2', label:'2ª FASE', title:'2ª Fase', subtitle:'Será liberada automaticamente quando a fase começar.', unlockAt:'2026-06-05T11:00:00-03:00' },
  { id:'stage3', label:'3ª FASE', title:'3ª Fase', subtitle:'Será liberada automaticamente quando a fase começar.', unlockAt:'2026-06-08T11:00:00-03:00' },
  { id:'playoffs', label:'MATA-MATA', title:'Mata-mata', subtitle:'Será liberado automaticamente quando os playoffs começarem.', unlockAt:'2026-06-11T11:00:00-03:00' },
];

const fallbackLive = { standings:Object.fromEntries(TEAMS.map(t=>[t.id,{...t,wins:0,losses:0,status:'alive',logo:t.logo}])), matches:[], schedule:[], source:'manual', updatedAt:null };
let state = loadState();
let live = fallbackLive;

function loadState(){
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!saved || !saved.stages) return emptyPicks();
    const base = emptyPicks();
    return { ...base, ...saved, stages: { ...base.stages, ...saved.stages } };
  } catch { return emptyPicks(); }
}
function save(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function currentStage(){ return state.stages[state.phase] || state.stages.stage1; }
function isUnlocked(phase){ return Date.now() >= new Date(phase.unlockAt).getTime(); }
function fmtDate(iso){ return new Date(iso).toLocaleString('pt-BR', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}); }
function byId(id){ return TEAMS.find(t=>t.id===id) || {id,name:id,country:''}; }
function standing(id){ const t = byId(id); return live.standings[id] || {id, name:t.name, wins:0, losses:0, status:'alive', logo:t.logo}; }

function statusForPick(id, zone){
  const s = standing(id);
  if(zone==='threeZero'){
    if(s.wins>=3 && s.losses===0) return 'correct';
    if(s.losses>0 || s.losses>=3 || s.wins>=3) return 'dead';
    return 'alive';
  }
  if(zone==='advance'){
    if(s.wins>=3) return 'correct';
    if(s.losses>=3) return 'dead';
    return 'alive';
  }
  if(zone==='zeroThree'){
    if(s.losses>=3 && s.wins===0) return 'correct';
    if(s.wins>0 || s.wins>=3 || s.losses>=3) return 'dead';
    return 'alive';
  }
  return 'pending';
}
function statusLabel(st){ return ({correct:'certo',alive:'com chance',dead:'sem chance',pending:'pendente'})[st] || st; }
function initials(n){ return n.split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase(); }
function logoHtml(t){
  const s = standing(t.id);
  const src = s.logo || t.logo;
  if(src) return `<span class="logo"><img src="${src}" alt="${t.name}" onerror="this.remove();this.parentElement.textContent='${initials(t.name)}'" /></span>`;
  return `<span class="logo">${initials(t.name)}</span>`;
}
function teamCard(id, zone='pool'){
  const t = byId(id), s = standing(id), st = statusForPick(id, zone);
  return `<div class="team" draggable="true" data-id="${id}" onclick="openTeam('${id}','${zone}')">
    ${logoHtml(t)}
    <div class="team-main"><div class="name">${t.name}</div><div class="meta">${s.wins}-${s.losses} • ${statusLabel(st)}</div></div>
    <span class="pill ${st}">${statusLabel(st)}</span>
  </div>`;
}
function allPicked(stage){ return new Set([...(stage.threeZero||[]),...(stage.advance||[]),...(stage.zeroThree||[])]); }
function normalizePool(){
  const stage = currentStage();
  const picked = allPicked(stage);
  if(!stage.pool || !stage.pool.length) stage.pool = TEAMS.map(t=>t.id).filter(id=>!picked.has(id));
  stage.pool = TEAMS.map(t=>t.id).filter(id=>!picked.has(id));
}
function render(){
  renderTabs();
  const phase = PHASES.find(p=>p.id===state.phase) || PHASES[0];
  phaseTitle.textContent = phase.title;
  phaseSubtitle.textContent = phase.subtitle;

  if(!isUnlocked(phase)) return renderLockedPhase(phase);
  stageContent.innerHTML = stageTemplate();
  normalizePool();
  const stage = currentStage();
  document.querySelector('[data-zone="pool"]').innerHTML = stage.pool.map(id=>teamCard(id,'pool')).join('');
  document.querySelector('[data-zone="threeZero"]').innerHTML = stage.threeZero.map(id=>teamCard(id,'threeZero')).join('') || '<small>Solte 2 equipes aqui</small>';
  document.querySelector('[data-zone="advance"]').innerHTML = stage.advance.map(id=>teamCard(id,'advance')).join('') || '<small>Solte 6 equipes aqui</small>';
  document.querySelector('[data-zone="zeroThree"]').innerHTML = stage.zeroThree.map(id=>teamCard(id,'zeroThree')).join('') || '<small>Solte 2 equipes aqui</small>';
  renderStandings(); renderMatches(); renderCalendar(); renderScore(); bindDrag(); save();
}
function stageTemplate(){
  return `<div class="pick-zones">
    <section class="pick-section pick-section-compact qualified"><div class="pick-title"><strong>3x0</strong><span>Classificadas perfeitas</span></div><div class="slots slots-two dropzone" data-zone="threeZero"></div></section>
    <section class="pick-section advance"><div class="pick-title"><strong>3x1 / 3x2</strong><span>Classificadas</span></div><div class="slots slots-grid dropzone" data-zone="advance"></div></section>
    <section class="pick-section pick-section-compact eliminated"><div class="pick-title"><strong>0x3</strong><span>Eliminadas sem vitória</span></div><div class="slots slots-two dropzone" data-zone="zeroThree"></div></section>
  </div>`;
}
function renderLockedPhase(phase){
  stageContent.innerHTML = `<div class="locked-panel"><div class="lock-icon">🔒</div><h2>${phase.title} bloqueada</h2><p>Essa fase será liberada automaticamente em:</p><strong>${fmtDate(phase.unlockAt)}</strong><small>Quando chegar a data, basta atualizar a página ou clicar em Atualizar HLTV.</small></div>`;
  renderStandings(); renderMatches(); renderCalendar(); renderScore(); save();
}
function renderTabs(){
  phaseTabs.innerHTML = PHASES.map(p=>`<button data-phase="${p.id}" class="${state.phase===p.id?'active':''} ${isUnlocked(p)?'':'locked'}">${p.label}${isUnlocked(p)?'':' 🔒'}</button>`).join('');
  phaseTabs.querySelectorAll('button').forEach(btn=>btn.onclick=()=>{
    const p = PHASES.find(x=>x.id===btn.dataset.phase);
    if(!isUnlocked(p)) return openPhaseLocked(p);
    state.phase = p.id; render();
  });
}
function openPhaseLocked(phase){
  phaseModalContent.innerHTML = `<h2>${phase.title} ainda não foi liberada</h2><p>Liberação configurada para:</p><h3>${fmtDate(phase.unlockAt)}</h3>`;
  phaseModal.showModal();
}
function renderScore(){
  const stage = currentStage();
  const picks = [['threeZero',stage.threeZero],['advance',stage.advance],['zeroThree',stage.zeroThree]].flatMap(([z,arr])=>(arr||[]).map(id=>statusForPick(id,z)));
  scoreOk.textContent = picks.filter(x=>x==='correct').length;
  scoreAlive.textContent = picks.filter(x=>x==='alive').length;
  scoreDead.textContent = picks.filter(x=>x==='dead').length;
  lastSync.textContent = live.updatedAt ? new Date(live.updatedAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : '--';
}
function renderStandings(){
  const rows = Object.values(live.standings).sort((a,b)=>b.wins-a.wins || a.losses-b.losses || a.name.localeCompare(b.name));
  standings.innerHTML = rows.map(s=>`<div class="standing-row ${s.status}">${logoHtml(s)}<b>${s.name}</b><span class="record">${s.wins}-${s.losses}</span></div>`).join('');
}
function renderMatches(){
  matches.innerHTML = (live.matches||[]).slice(0,20).map(m=>`<div class="match"><b>${m.a} ${m.scoreA} : ${m.scoreB} ${m.b}</b><br><span>${m.round||''} ${m.map? '• '+m.map:''}</span></div>`).join('') || '<p>Nenhum resultado detectado ainda.</p>';
}
function renderCalendar(){
  const items = live.schedule || [];
  calendar.innerHTML = items.length ? items.map(m=>`<div class="calendar-item"><div><b>${m.a}</b><span>vs</span><b>${m.b}</b></div><small>${m.dateText || fmtDate(m.startsAt)} ${m.round ? '• '+m.round : ''}</small></div>`).join('') : '<p>Nenhum próximo jogo detectado no momento.</p>';
}
function bindDrag(){
  document.querySelectorAll('.team').forEach(el=>{
    el.addEventListener('dragstart',e=>{ el.classList.add('dragging'); e.dataTransfer.setData('text/plain',el.dataset.id); });
    el.addEventListener('dragend',()=>el.classList.remove('dragging'));
  });
  document.querySelectorAll('.dropzone').forEach(z=>{
    z.ondragover=e=>{e.preventDefault();z.classList.add('dragover')}; z.ondragleave=()=>z.classList.remove('dragover');
    z.ondrop=e=>{e.preventDefault();z.classList.remove('dragover'); moveTeam(e.dataTransfer.getData('text/plain'), z.dataset.zone);};
  });
}
function moveTeam(id, zone){
  const stage = currentStage();
  for(const k of ['pool','threeZero','advance','zeroThree']) stage[k] = (stage[k]||[]).filter(x=>x!==id);
  const limits = {threeZero:2, advance:6, zeroThree:2, pool:99};
  if(stage[zone].length >= limits[zone]) stage.pool.push(stage[zone].shift());
  stage[zone].push(id); save(); render();
}
function openTeam(id, zone){
  const t=byId(id), s=standing(id), st=statusForPick(id,zone);
  modalContent.innerHTML = `<h2>${t.name}</h2><p>Placar real: <b>${s.wins}-${s.losses}</b></p><p>Status do seu palpite: <b>${statusLabel(st)}</b></p><p class="muted-text">Os palpites ficam salvos automaticamente no localStorage deste navegador.</p>`;
  teamModal.showModal();
}
async function syncLive(){
  syncBtn.disabled=true; syncBtn.textContent='Atualizando...';
  try{
    const r=await fetch('/api/live?ts='+Date.now()); const data=await r.json();
    const st={}; for(const s of data.standings) st[s.id]=s;
    live={...data, standings:st};
  }catch(e){ console.error(e); alert('Não consegui buscar agora. Verifique a internet ou rode novamente o servidor.'); }
  finally{ syncBtn.disabled=false; syncBtn.textContent='Atualizar HLTV'; render(); }
}
syncBtn.onclick=syncLive;
render(); syncLive();
