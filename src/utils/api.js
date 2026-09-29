// Configuration de l'URL de base de l'API
export const API_BASE = import.meta.env.VITE_API_URL || 
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000' 
    : 'https://hopicile.r32-dev.fr/hopicile-tech');

export async function fetchDevices(category = '') {
  const url = category ? `${API_BASE}/api/devices?category=${encodeURIComponent(category)}` : `${API_BASE}/api/devices`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Erreur HTTP ${res.status}`);
  return await res.json();
}

export async function fetchDeviceBySerial(serialNumber) {
  const res = await fetch(`${API_BASE}/api/devices/${encodeURIComponent(serialNumber.trim())}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Erreur HTTP ${res.status}`);
  const data = await res.json();
  return data.device;
}

export async function createDevice(deviceData) {
  const res = await fetch(`${API_BASE}/api/devices`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(deviceData)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Erreur lors de la création');
  return data.device;
}

export async function chargeDevice(serialNumber, operator = 'Opérateur', notes = '') {
  const res = await fetch(`${API_BASE}/api/devices/${encodeURIComponent(serialNumber.trim())}/charge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operator, notes })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Erreur lors de la charge');
  return data.device;
}

export async function getVapidPublicKey() {
  try {
    const res = await fetch(`${API_BASE}/api/push/vapid-public-key`);
    if (res.ok) {
      const data = await res.json();
      return data.publicKey;
    }
  } catch (e) {
    console.warn("Impossible de récupérer la clé VAPID dynamiquement, utilisation fallback :", e);
  }
  return 'BD3SSctcsVsnXcS5_vBBj8f-QDHzuCRcF01jmYRhsq-Xb3Yd3AsmdXqZtkcix2Q9faIaWtQb_VgjGpVLI09lRP0';
}

export async function registerPushSubscription(subscription) {
  const res = await fetch(`${API_BASE}/api/push/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(subscription)
  });
  return await res.json();
}

export async function sendTestPush() {
  const res = await fetch(`${API_BASE}/api/push/test`, { method: 'POST' });
  return await res.json();
}

export async function triggerChargeCheck() {
  const res = await fetch(`${API_BASE}/api/push/check-now`, { method: 'POST' });
  return await res.json();
}
