const { onSchedule } = require('firebase-functions/v2/scheduler');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();
const db = getFirestore();

function localParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
    weekday: 'short'
  }).formatToParts(date);
  return Object.fromEntries(parts.map(p => [p.type, p.value]));
}
function weekdayNumber(shortName) {
  return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(shortName);
}

exports.sendCareReminders = onSchedule({
  schedule: 'every 1 minutes',
  timeZone: 'America/Sao_Paulo',
  region: 'southamerica-east1',
  retryCount: 0,
  memory: '256MiB',
  timeoutSeconds: 55
}, async () => {
  const now = new Date();
  const snap = await db.collectionGroup('devices').where('enabled', '==', true).get();
  const sends = [];

  for (const doc of snap.docs) {
    const d = doc.data();
    if (!d.token || !Array.isArray(d.routine)) continue;
    const tz = d.timezone || 'America/Sao_Paulo';
    const p = localParts(now, tz);
    const dateKey = `${p.year}-${p.month}-${p.day}`;
    const hhmm = `${p.hour}:${p.minute}`;
    const dow = weekdayNumber(p.weekday);

    for (const task of d.routine) {
      const days = Array.isArray(task.days) ? task.days : [0,1,2,3,4,5,6];
      if (task.time !== hhmm || !days.includes(dow)) continue;
      const sentKey = `${dateKey}_${task.id}`;
      const sent = d.sent || {};
      if (sent[sentKey]) continue;

      const title = task.type === 'med' ? 'Hora do medicamento' :
                    task.type === 'gly' ? 'Hora de medir a glicemia' : 'Cuidado Dona Nair';
      const body = `${task.label} está programado para ${task.time}.`;
      sends.push((async () => {
        try {
          await getMessaging().send({
            token: d.token,
            data: { title, body, tag: String(task.id), url: './' },
            webpush: { headers: { Urgency: 'high' } }
          });
          await doc.ref.set({
            [`sent.${sentKey}`]: FieldValue.serverTimestamp(),
            lastSuccessAt: FieldValue.serverTimestamp()
          }, { merge: true });
        } catch (error) {
          console.error('Falha FCM', doc.ref.path, error.code || error.message);
          const code = error.code || '';
          if (code.includes('registration-token-not-registered') || code.includes('invalid-registration-token')) {
            await doc.ref.set({ enabled: false, disabledReason: code }, { merge: true });
          }
        }
      })());
    }
  }
  await Promise.all(sends);
  console.log(`Lembretes enviados: ${sends.length}`);
});
