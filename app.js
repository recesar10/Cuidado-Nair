const VERSION = '1.2';
const KEYS = { routine:'nair_routine_v12', logs:'nair_logs_v12', phone:'nair_phone_v12' };
const defaultRoutine = [
  { id:'med_manha', type:'medicine', time:'07:30', title:'Remédio da manhã', action:'TOMEI O REMÉDIO', emoji:'💊', color:'purple' },
  { id:'cafe', type:'meal', time:'08:00', title:'Café da manhã', action:'JÁ TOMEI CAFÉ', emoji:'☕', color:'orange' },
  { id:'glicemia_almoco', type:'glucose', time:'12:00', title:'Medir glicemia', action:'MEDIR GLICEMIA', emoji:'🩸', color:'teal' },
  { id:'almoco', type:'meal', time:'12:30', title:'Almoço', action:'JÁ ALMOCEI', emoji:'🍽️', color:'orange' },
  { id:'med_noite', type:'medicine', time:'18:00', title:'Remédio da noite', action:'TOMEI O REMÉDIO', emoji:'💊', color:'purple' },
  { id:'jantar', type:'meal', time:'19:00', title:'Jantar', action:'JÁ JANTEI', emoji:'🌙', color:'orange' }
];
let pendingInstallPrompt = null;
let activeTaskForDialog = null;

const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];
const todayKey = () => new Date().toISOString().slice(0,10);
const pad = n => String(n).padStart(2,'0');
const timeNow = () => `${pad(new Date().getHours())}:${pad(new Date().getMinutes())}`;
const minutesOf = t => { const [h,m]=t.split(':').map(Number); return h*60+m; };
const nowMinutes = () => new Date().getHours()*60 + new Date().getMinutes();

function load(key, fallback){ try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function save(key, value){ localStorage.setItem(key, JSON.stringify(value)); }
function routine(){ return load(KEYS.routine, defaultRoutine); }
function logs(){ return load(KEYS.logs, []); }
function setLogs(v){ save(KEYS.logs, v); }
function todayLogs(){ return logs().filter(l => l.date === todayKey()); }
function isDone(task){ return todayLogs().some(l => l.taskId === task.id); }
function taskStatus(task){
  if(isDone(task)) return 'done';
  if(minutesOf(task.time) < nowMinutes()) return 'late';
  return 'pending';
}
function nextTask(){
  const tasks = routine().slice().sort((a,b)=>minutesOf(a.time)-minutesOf(b.time));
  return tasks.find(t => !isDone(t)) || null;
}
function greeting(){ const h = new Date().getHours(); if(h<12) return 'Bom dia'; if(h<18) return 'Boa tarde'; return 'Boa noite'; }
function formatDate(){ return new Intl.DateTimeFormat('pt-BR',{weekday:'long', day:'numeric', month:'long', year:'numeric'}).format(new Date()); }
function addLog(task, note='', value=null, alert=false){
  const entry = { id: Date.now(), date: todayKey(), time: timeNow(), taskId: task.id, type: task.type, title: task.title, note, value, alert };
  setLogs([...logs(), entry]);
  if(alert) playAlarm();
  render();
}
function playAlarm(){ const audio = $('#alarmAudio'); if(audio){ audio.currentTime=0; audio.play().catch(()=>{}); } if(navigator.vibrate) navigator.vibrate([250,120,250]); }
function glucoseMessage(value){
  if(value < 54) return { alert:true, note:`${value} mg/dL - GLICEMIA MUITO BAIXA. Verificar imediatamente e seguir orientação médica.` };
  if(value < 70) return { alert:true, note:`${value} mg/dL - glicemia baixa. Atenção e seguir orientação médica.` };
  if(value > 250) return { alert:true, note:`${value} mg/dL - glicemia alta. Acompanhar e seguir orientação médica.` };
  return { alert:false, note:`${value} mg/dL` };
}
function completeTask(task){
  if(task.type === 'glucose') { activeTaskForDialog = task; $('#glucoseInput').value=''; $('#glucoseDialog').showModal(); return; }
  addLog(task, task.type === 'medicine' ? 'Remédio confirmado' : 'Refeição confirmada');
}
function manualMeal(typeTitle){
  const task = { id:'meal_manual_'+Date.now(), type:'meal', time:timeNow(), title:typeTitle, action:'REGISTRAR', emoji:'🍽️', color:'orange' };
  addLog(task,'Refeição registrada manualmente');
}

function renderAssistant(){
  const task = nextTask();
  const doneCount = todayLogs().length;
  $('#statusLine').textContent = task ? `${task.time} • Próxima atividade` : 'Tudo concluído';
  if(!task){
    $('#assistantTitle').textContent = `Parabéns, Dona Nair! 🎉`;
    $('#assistantSubtitle').textContent = 'As atividades cadastradas de hoje foram registradas.';
    $('#taskActionArea').innerHTML = `<button class="task-button emergency" id="helpBtn">❤️ PRECISO DE AJUDA</button>`;
    $('#helpBtn').onclick = callFamily;
    return;
  }
  const status = taskStatus(task);
  $('#assistantTitle').textContent = `${greeting()}, Dona Nair`;
  $('#assistantSubtitle').textContent = status === 'late'
    ? `Está atrasado: ${task.emoji} ${task.title}. Toque no botão quando fizer.`
    : `Agora a próxima atividade é: ${task.emoji} ${task.title}.`;
  $('#taskActionArea').innerHTML = `
    <button class="task-button ${task.color}" id="mainTaskBtn">${task.emoji} ${task.action}</button>
    <button class="task-button emergency" id="helpBtn">❤️ PRECISO DE AJUDA</button>`;
  $('#mainTaskBtn').onclick = () => completeTask(task);
  $('#helpBtn').onclick = callFamily;
  if(status === 'late') playAlarmOncePerTask(task.id);
}
const alarmed = new Set();
function playAlarmOncePerTask(id){ if(alarmed.has(id)) return; alarmed.add(id); playAlarm(); }
function renderSummary(){
  const tasks = routine();
  const today = todayLogs();
  const done = tasks.filter(isDone).length;
  const late = tasks.filter(t => taskStatus(t)==='late').length;
  const alerts = today.filter(l => l.alert).length;
  const pending = tasks.length - done;
  $('#countDone').textContent = done;
  $('#countPending').textContent = pending;
  $('#countLate').textContent = late;
  $('#countAlerts').textContent = alerts;
  const box = $('#dayHealth');
  box.className = 'day-health ' + (alerts||late ? 'danger' : pending ? 'warn' : 'ok');
  box.textContent = alerts ? 'Atenção: houve alerta de glicemia hoje.' : late ? `Atenção: ${late} atividade(s) atrasada(s).` : pending ? `Hoje faltam ${pending} atividade(s).` : 'Hoje está tudo certo.';
}
function renderTimeline(){
  const items = todayLogs().slice().sort((a,b)=>a.time.localeCompare(b.time));
  $('#timelineList').innerHTML = items.length ? items.map(l=>`
    <div class="timeline-item">
      <div class="timeline-time">${l.time}</div>
      <div><div class="timeline-title">${iconFor(l.type)} ${l.title} <span class="badge ${l.alert?'late':'done'}">${l.alert?'Alerta':'Feito'}</span></div><div class="timeline-note">${l.note||''}</div></div>
    </div>`).join('') : '<p class="muted">Nenhum registro hoje ainda.</p>';
}
function renderFamily(){
  const rows = routine().map(t => {
    const st = taskStatus(t);
    const label = st === 'done' ? 'Feito' : st === 'late' ? 'Atrasado' : 'Pendente';
    return `<div class="family-row"><strong>${t.emoji} ${t.time} ${t.title}</strong><span class="badge ${st==='done'?'done':st==='late'?'late':'next'}">${label}</span></div>`;
  }).join('');
  $('#familyStatus').innerHTML = rows;
}
function renderSettings(){
  $('#routineEditor').innerHTML = routine().map(t=>`
    <div class="routine-line" data-id="${t.id}">
      <input type="time" value="${t.time}" aria-label="Horário de ${t.title}">
      <strong>${t.emoji} ${t.title}</strong>
    </div>`).join('');
  $('#familyPhone').value = localStorage.getItem(KEYS.phone) || '';
}
function iconFor(type){ return type==='medicine'?'💊':type==='glucose'?'🩸':'🍽️'; }
function render(){
  $('#todayText').textContent = formatDate();
  renderAssistant(); renderSummary(); renderTimeline(); renderFamily(); renderSettings();
}
function callFamily(){
  const phone = localStorage.getItem(KEYS.phone) || '';
  const text = encodeURIComponent('Preciso de ajuda com a Dona Nair. Pode verificar, por favor?');
  if(phone) location.href = `https://wa.me/${phone}?text=${text}`;
  else alert('Cadastre um WhatsApp da família em Ajustes.');
}
function exportCSV(){
  const rows = [['Data','Hora','Tipo','Atividade','Valor','Observação','Alerta'], ...logs().map(l=>[l.date,l.time,l.type,l.title,l.value??'',l.note??'',l.alert?'sim':'não'])];
  const csv = rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(';')).join('\n');
  const blob = new Blob([csv],{type:'text/csv;charset=utf-8'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `relatorio_dona_nair_${todayKey()}.csv`; a.click(); URL.revokeObjectURL(a.href);
}
function sendSummaryWhats(){
  const phone = localStorage.getItem(KEYS.phone) || '';
  const tasks = routine();
  const text = encodeURIComponent('Resumo Dona Nair hoje:\n' + tasks.map(t=>`${t.time} ${t.title}: ${taskStatus(t)==='done'?'feito':taskStatus(t)==='late'?'atrasado':'pendente'}`).join('\n'));
  if(phone) location.href = `https://wa.me/${phone}?text=${text}`; else alert('Cadastre o WhatsApp da família em Ajustes.');
}
function initEvents(){
  $$('.nav').forEach(btn=>btn.onclick=()=>{ $$('.nav').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); $$('.screen').forEach(s=>s.classList.remove('active')); $('#screen'+btn.dataset.screen).classList.add('active'); render(); });
  $('#glucoseForm').addEventListener('submit', e=>{ e.preventDefault(); const val = Number($('#glucoseInput').value); if(!val){ alert('Digite o valor da glicemia.'); return; } const msg = glucoseMessage(val); addLog(activeTaskForDialog || {id:'glicemia_manual_'+Date.now(), type:'glucose', time:timeNow(), title:'Glicemia', emoji:'🩸'}, msg.note, val, msg.alert); $('#glucoseDialog').close(); });
  $('#exportBtn').onclick = exportCSV; $('#whatsBtn').onclick = sendSummaryWhats;
  $('#clearTodayBtn').onclick = ()=>{ if(confirm('Limpar os registros de hoje?')) { setLogs(logs().filter(l=>l.date!==todayKey())); render(); } };
  $('#saveRoutineBtn').onclick = ()=>{ const updated = routine().map(t=>{ const line = $(`.routine-line[data-id="${t.id}"] input`); return {...t, time: line.value || t.time}; }); save(KEYS.routine, updated); alert('Rotina salva.'); render(); };
  $('#resetRoutineBtn').onclick = ()=>{ if(confirm('Restaurar rotina padrão?')){ save(KEYS.routine, defaultRoutine); render(); } };
  $('#savePhoneBtn').onclick = ()=>{ localStorage.setItem(KEYS.phone, $('#familyPhone').value.trim()); alert('Contato salvo.'); };
  window.addEventListener('beforeinstallprompt', e=>{ e.preventDefault(); pendingInstallPrompt=e; $('#installBtn').classList.remove('hidden'); });
  $('#installBtn').onclick=async()=>{ if(pendingInstallPrompt){ pendingInstallPrompt.prompt(); await pendingInstallPrompt.userChoice; pendingInstallPrompt=null; $('#installBtn').classList.add('hidden'); }};
}
if('serviceWorker' in navigator){ navigator.serviceWorker.register('sw.js?v=12').catch(()=>{}); }
initEvents(); render(); setInterval(render, 60000);
