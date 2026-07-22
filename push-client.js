(() => {
  const cfg = globalThis.CUIDADO_NAIR_FIREBASE;
  let app, auth, db, messaging, currentUid, deviceId;

  function readyConfig() {
    return cfg && cfg.enabled && cfg.vapidKey && cfg.firebaseConfig && cfg.firebaseConfig.projectId;
  }
  function getDeviceId() {
    let id = localStorage.getItem('nair_push_device_id');
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : 'dev_' + Date.now() + '_' + Math.random().toString(36).slice(2));
      localStorage.setItem('nair_push_device_id', id);
    }
    return id;
  }
  async function ensureFirebase() {
    if (!readyConfig()) return false;
    if (!firebase.apps.length) app = firebase.initializeApp(cfg.firebaseConfig);
    else app = firebase.app();
    auth = firebase.auth();
    db = firebase.firestore();
    messaging = firebase.messaging();
    if (!auth.currentUser) await auth.signInAnonymously();
    currentUid = auth.currentUser.uid;
    deviceId = getDeviceId();
    return true;
  }
  async function getFcmToken() {
    const reg = await navigator.serviceWorker.ready;
    return messaging.getToken({ vapidKey: cfg.vapidKey, serviceWorkerRegistration: reg });
  }
  function cleanRoutine(routine) {
    return (routine || []).map(t => ({
      id: String(t.id), type: String(t.type || 'other'), icon: String(t.icon || '⭐'),
      label: String(t.label || 'Cuidado'), time: String(t.time || '09:00'),
      days: Array.isArray(t.days) ? t.days.map(Number) : [0,1,2,3,4,5,6]
    }));
  }
  async function sync(routine, patientName) {
    if (!(await ensureFirebase())) return { configured: false };
    if (Notification.permission !== 'granted') return { configured: true, permission: false };
    const token = await getFcmToken();
    if (!token) throw new Error('O Firebase não forneceu um token de notificação.');
    await db.collection('users').doc(currentUid).collection('devices').doc(deviceId).set({
      token,
      patientName: patientName || 'Dona Nair',
      timezone: cfg.timezone || 'America/Sao_Paulo',
      routine: cleanRoutine(routine),
      enabled: true,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      userAgent: navigator.userAgent
    }, { merge: true });
    localStorage.setItem('nair_push_synced', new Date().toISOString());
    return { configured: true, permission: true, token: true };
  }
  async function activate(routine, patientName) {
    const result = await sync(routine, patientName);
    if (!result.configured) {
      alert('A notificação em segundo plano ainda precisa da configuração do Firebase. Veja o arquivo LEIA-ME-FIREBASE.txt do pacote.');
    } else if (result.permission) {
      console.log('Cuidado Dona Nair: push sincronizado.');
    }
    return result;
  }
  async function init(routine, patientName) {
    if (!readyConfig()) return { configured: false };
    if (Notification.permission === 'granted' && localStorage.getItem('nair_notifications') === 'on') {
      return sync(routine, patientName);
    }
    return { configured: true, permission: false };
  }
  window.CuidadoPush = { init, activate, sync };
})();
