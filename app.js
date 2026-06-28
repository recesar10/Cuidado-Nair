const KEY = 'donaNair.records.v1';
const SETTINGS = 'donaNair.settings.v1';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const defaultSchedule = [
  { id:'med-morning', time:'07:30', type:'Remédio', label:'Remédio da manhã', screen:'meds' },
  { id:'meal-breakfast', time:'08:00', type:'Alimentação', label:'Café da manhã', screen:'meal' },
  { id:'gly-noon', time:'12:00', type:'Glicemia', label:'Medir glicemia', screen:'glucose' },
  { id:'meal-lunch', time:'12:30', type:'Alimentação', label:'Almoço', screen:'meal' },
  { id:'med-night', time:'18:00', type:'Remédio', label:'Remédio da noite', screen:'meds' },
  { id:'meal-dinner', time:'19:00', type:'Alimentação', label:'Jantar', screen:'meal' },
];
let deferredPrompt = null;
let activeAlarm = null;
let alarmTimer = null;
function todayKey(){ return new Date().toISOString().slice(0,10); }
function nowTime(){ return new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}); }
function load(){ return JSON.parse(localStorage.getItem(KEY) || '[]'); }
function save(records){ localStorage.setItem(KEY, JSON.stringify(records)); render(); }
function settings(){ return JSON.parse(localStorage.getItem(SETTINGS) || '{"phones":"","sound":true,"notify":true}'); }
function saveSettings(s){ localStorage.setItem(SETTINGS, JSON.stringify(s)); }
function addRecord(type, label, extra={}){
  const records = load();
  records.push({ id:crypto.randomUUID(), date:todayKey(), time:nowTime(), type, label, ...extra });
  save(records);
  stopAlarm();
  openScreen('home');
}
function openScreen(id){
  $$('.screen').forEach(s=>s.classList.remove('active'));
  $('#'+id).classList.add('active');
  $$('.bottom-nav button').forEach(b=>b.classList.toggle('nav-active', b.dataset.open===id));
  window.scrollTo({top:0,behavior:'smooth'});
}
function render(){
  const records = load();
  const today = records.filter(r=>r.date===todayKey());
  $('#todayText').textContent = new Date().toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'});
  $('#medCount').textContent = today.filter(r=>r.type==='Remédio').length;
  $('#glyCount').textContent = today.filter(r=>r.type==='Glicemia').length;
  $('#mealCount').textContent = today.filter(r=>r.type==='Alimentação').length;
  $('#alertCount').textContent = today.filter(r=>r.type==='Alerta').length;
  renderSchedule(today);
  renderHistory(records);
  renderUrgent(today);
}
function doneForItem(item, today){
  return today.some(r => {
    if(item.type==='Remédio') return r.type==='Remédio' && Math.abs(minutes(r.time)-minutes(item.time)) < 240;
    if(item.type==='Glicemia') return r.type==='Glicemia' && Math.abs(minutes(r.time)-minutes(item.time)) < 240;
    if(item.label==='Café da manhã') return r.label==='Café da manhã';
    if(item.label==='Almoço') return r.label==='Almoço';
    if(item.label==='Jantar') return r.label==='Jantar';
    return false;
  });
}
function minutes(hhmm){ const [h,m]=hhmm.split(':').map(Number); return h*60+m; }
function renderSchedule(today){
  const now = new Date(); const nowM = now.getHours()*60 + now.getMinutes();
  $('#scheduleList').innerHTML = defaultSchedule.map(item=>{
    const done = doneForItem(item,today);
    const late = !done && nowM > minutes(item.time)+15;
    const status = done ? 'Feito' : late ? 'Atrasado' : 'Pendente';
    const cls = done ? 'status-ok' : late ? 'status-late' : 'status-pending';
    return `<button class="schedule-item" data-open="${item.screen}"><span><b>${item.time}</b><br>${item.label}</span><span class="${cls}">${status}</span></button>`;
  }).join('');
  $$('#scheduleList [data-open]').forEach(b=>b.onclick=()=>openScreen(b.dataset.open));
}
function renderHistory(records){
  const last = [...records].reverse().slice(0,100);
  $('#historyList').innerHTML = last.length ? last.map(r=>{
    const detail = r.value ? ` — <b>${r.value} mg/dL</b>` : '';
    const cls = r.severity==='danger' ? 'status-late' : r.severity==='warn' ? 'status-pending' : 'status-ok';
    return `<div class="history-item"><b>${r.date} ${r.time}</b><br>${r.type}: ${r.label}${detail}<br><span class="${cls}">${r.note || 'Registrado'}</span></div>`;
  }).join('') : '<p class="hint">Nenhum registro ainda.</p>';
}
function renderUrgent(today){
  const lastDanger = [...today].reverse().find(r=>r.type==='Glicemia' && Number(r.value) < 70);
  if(!lastDanger){ $('#urgentCard').classList.add('hidden'); return; }
  const v = Number(lastDanger.value);
  $('#urgentCard').classList.remove('hidden');
  $('#urgentText').textContent = v < 54 ? `Glicemia muito baixa registrada: ${v} mg/dL. Verificar imediatamente.` : `Glicemia baixa registrada: ${v} mg/dL. Acompanhar de perto.`;
}
function glucoseSeverity(v){
  if(v < 54) return {severity:'danger', note:'Glicemia muito baixa'};
  if(v < 70) return {severity:'warn', note:'Glicemia baixa'};
  return {severity:'ok', note:'Registrado'};
}
function updateGlucoseWarning(){
  const v = Number($('#glucoseValue').value);
  const box = $('#glucoseWarning');
  if(!v){ box.classList.add('hidden'); return; }
  box.classList.remove('hidden');
  if(v < 54) box.innerHTML = '🚨 <b>Glicemia muito baixa!</b><br>Verificar imediatamente e seguir orientação médica.';
  else if(v < 70) box.innerHTML = '⚠️ <b>Glicemia baixa.</b><br>Acompanhar, alimentar conforme orientação médica e avisar família.';
  else box.innerHTML = '✅ Valor registrado para acompanhamento.';
}
function whatsappLink(text){
  const phones = settings().phones.split(/\n|,|;/).map(p=>p.replace(/\D/g,'')).filter(Boolean);
  const phone = phones[0] || '';
  return `https://wa.me/55${phone}?text=${encodeURIComponent(text)}`;
}
async function notify(title, body){
  if(!settings().notify) return;
  if('Notification' in window){
    if(Notification.permission === 'default') await Notification.requestPermission();
    if(Notification.permission === 'granted') new Notification(title, {body});
  }
}
function startAlarm(item){
  activeAlarm = item;
  $('#alarmTitle').textContent = item.type;
  $('#alarmMessage').textContent = `${item.label} — horário ${item.time}.`;
  $('#alarmModal').classList.remove('hidden');
  addRecord('Alerta', item.label, {note:'Alerta disparado'});
  if(settings().sound){ $('#alarmAudio').play().catch(()=>{}); }
  notify(`Cuidado Dona Nair: ${item.type}`, `${item.label} ainda não foi confirmado.`);
}
function stopAlarm(){
  $('#alarmAudio').pause(); $('#alarmAudio').currentTime = 0;
  $('#alarmModal').classList.add('hidden');
  activeAlarm = null;
}
function checkDue(){
  const records = load(); const today = records.filter(r=>r.date===todayKey());
  const now = new Date(); const nowM = now.getHours()*60 + now.getMinutes();
  const due = defaultSchedule.find(item => !doneForItem(item,today) && nowM >= minutes(item.time) && nowM <= minutes(item.time)+16);
  if(due && (!activeAlarm || activeAlarm.id !== due.id)) startAlarm(due);
}
function exportCsv(){
  const rows = [['Data','Hora','Tipo','Descrição','Valor glicemia','Observação']];
  load().forEach(r=>rows.push([r.date,r.time,r.type,r.label,r.value||'',r.note||'']));
  const csv = rows.map(row=>row.map(v=>`"${String(v).replaceAll('"','""')}"`).join(';')).join('\n');
  const blob = new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download=`relatorio-dona-nair-${todayKey()}.csv`; a.click();
  URL.revokeObjectURL(url);
}
function setup(){
  $$('[data-open]').forEach(b=>b.onclick=()=>openScreen(b.dataset.open));
  $('#medButtons').innerHTML = defaultSchedule.filter(i=>i.type==='Remédio').map(i=>`<button data-med="${i.label}">💊 ${i.time} — ${i.label}</button>`).join('');
  $$('#medButtons button').forEach(b=>b.onclick=()=>addRecord('Remédio', b.dataset.med));
  $('#saveCustomMed').onclick = ()=>addRecord('Remédio','Remédio registrado manualmente');
  $$('#meal [data-meal]').forEach(b=>b.onclick=()=>addRecord('Alimentação', b.dataset.meal));
  $('#saveGlucose').onclick = ()=>{ const v=Number($('#glucoseValue').value); if(!v) return alert('Digite o valor da glicemia.'); addRecord('Glicemia','Medição de glicemia',{value:v,...glucoseSeverity(v)}); $('#glucoseValue').value=''; };
  $('#glucoseValue').oninput = updateGlucoseWarning;
  $('#keypad').innerHTML = [1,2,3,4,5,6,7,8,9,'limpar',0,'⌫'].map(k=>`<button>${k}</button>`).join('');
  $$('#keypad button').forEach(b=>b.onclick=()=>{ const t=b.textContent; const input=$('#glucoseValue'); if(t==='limpar') input.value=''; else if(t==='⌫') input.value=input.value.slice(0,-1); else input.value+=t; updateGlucoseWarning(); });
  $('#exportCsv').onclick = exportCsv;
  $('#clearData').onclick = ()=>{ if(confirm('Limpar registros de teste?')){ localStorage.removeItem(KEY); render(); }};
  const s = settings(); $('#familyPhones').value=s.phones; $('#soundOn').checked=s.sound; $('#notifyOn').checked=s.notify;
  $('#savePhones').onclick=()=>{ const cur=settings(); cur.phones=$('#familyPhones').value; cur.sound=$('#soundOn').checked; cur.notify=$('#notifyOn').checked; saveSettings(cur); alert('Configurações salvas.'); };
  $('#testAlarm').onclick=()=>startAlarm({type:'Teste de alerta',label:'Este é um alerta sonoro/mensagem de teste',time:nowTime(),id:'test'});
  $('#alarmDone').onclick=()=>{ if(activeAlarm){ const type = activeAlarm.type==='Alimentação'?'Alimentação':activeAlarm.type==='Glicemia'?'Glicemia':'Remédio'; addRecord(type, activeAlarm.label, {note:'Confirmado após alerta'}); } else stopAlarm(); };
  $('#alarmSnooze').onclick=()=>{ const item = activeAlarm || {type:'Lembrete',label:'Atividade pendente',time:nowTime(),id:'snooze'}; stopAlarm(); setTimeout(()=>startAlarm(item), 10*60*1000); };
  $('#alarmFamily').onclick=()=>window.open(whatsappLink('Atenção: a Dona Nair ainda não confirmou uma atividade no app. Pode verificar?'),'_blank');
  $('#openWhatsapp').onclick=()=>window.open(whatsappLink('Atenção: foi registrada glicemia baixa para a Dona Nair. Pode verificar imediatamente?'),'_blank');
  window.addEventListener('beforeinstallprompt', e=>{ e.preventDefault(); deferredPrompt=e; $('#installBtn').classList.remove('hidden'); });
  $('#installBtn').onclick=async()=>{ if(deferredPrompt){ deferredPrompt.prompt(); deferredPrompt=null; $('#installBtn').classList.add('hidden'); }};
  if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
  render(); checkDue(); setInterval(checkDue, 60*1000);
}
setup();
