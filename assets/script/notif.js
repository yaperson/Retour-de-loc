// notif.js

// Crée un container pour les notifications s'il n'existe pas
function ensureContainer() {
  let container = document.getElementById('notif-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'notif-container';
    Object.assign(container.style, {
      position: 'fixed',
      top: '1rem',
      right: '1rem',
      width: '300px',
      zIndex: 9999,
      fontFamily: 'Arial, sans-serif',
    });
    document.body.appendChild(container);
  }
  return container;
}

// Affiche une notification générique
function showNotif(message, bgColor = '#333', duration = 4000) {
  const container = ensureContainer();

  const notif = document.createElement('div');
  notif.textContent = message;
  Object.assign(notif.style, {
    backgroundColor: bgColor,
    color: 'white',
    padding: '10px 15px',
    marginBottom: '10px',
    borderRadius: '4px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
    opacity: '1',
    transition: 'opacity 0.5s ease',
    cursor: 'pointer',
  });

  // Click pour fermer
  notif.onclick = () => fadeOut(notif);

  container.appendChild(notif);

  // Disparition automatique
  setTimeout(() => fadeOut(notif), duration);
}

function fadeOut(elem) {
  elem.style.opacity = '0';
  setTimeout(() => {
    if (elem.parentNode) elem.parentNode.removeChild(elem);
  }, 500);
}

// Fonctions spécifiques
function modale(content) {
  alert(content); // Simple modale native, tu peux customiser
}

function error(message) {
  showNotif(message, '#d9534f'); // rouge
}

function warning(message) {
  showNotif(message, '#f0ad4e'); // orange
}

function success(message) {
  showNotif(message, '#5cb85c'); // vert
}

function info(message) {
  showNotif(message, '#5bc0de'); // bleu clair
}

export default {
  modale,
  error,
  warning,
  success,
  info
};
