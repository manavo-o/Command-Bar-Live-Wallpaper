// Keep the toolbar mark consistent while following system appearance.
(function initializeToolbarIcon() {
  if (!chrome.browserAction || typeof chrome.browserAction.setIcon !== 'function') return;

  const appearance = window.matchMedia('(prefers-color-scheme: dark)');

  function updateIcon() {
    const imageData = {};
    for (const size of [16, 32]) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const context = canvas.getContext('2d');
      context.fillStyle = appearance.matches ? '#EEEEEE' : '#888888';
      const scale = size / 128;
      for (let index = 0; index < 6; index += 1) {
        const angle = -Math.PI / 2 + index * Math.PI / 3;
        context.beginPath();
        context.arc((64 + 40 * Math.cos(angle)) * scale,
          (64 + 40 * Math.sin(angle)) * scale, 10 * scale, 0, Math.PI * 2);
        context.fill();
      }
      imageData[size] = context.getImageData(0, 0, size, size);
    }
    chrome.browserAction.setIcon({ imageData }, () => {
      // Reading lastError prevents an unchecked error if the browser is closing.
      void chrome.runtime.lastError;
    });
  }

  updateIcon();
  if (typeof appearance.addEventListener === 'function') {
    appearance.addEventListener('change', updateIcon);
  } else {
    appearance.addListener(updateIcon);
  }
})();
