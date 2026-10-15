'use strict';
(() => {
  const dialog = document.getElementById('installDialog');
  const status = document.getElementById('offlineStatus');
  document.getElementById('appInstall').addEventListener('click', () => dialog.showModal());
  document.getElementById('installClose').addEventListener('click', () => dialog.close());
  if (navigator.standalone || matchMedia('(display-mode: standalone)').matches) {
    document.getElementById('installIntro').textContent = '你已從 App 開啟掌上複盤，下次直接點主畫面圖示即可。';
    dialog.querySelector('.install-steps').hidden = true;
  }
  if (!('serviceWorker' in navigator) || !window.isSecureContext) {
    status.textContent = '目前無法準備離線資料。請用 Safari 開啟正式 HTTPS 網址；仍可連網使用複盤功能。';
    return;
  }
  const failed = () => {
    status.textContent = '離線資料尚未準備完成，請確認網路與可用空間，再重新開啟 App。現在仍可連網使用。';
  };
  navigator.serviceWorker.register('./sw.js', {updateViaCache: 'none'}).then(registration => {
    const watch = worker => {
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'redundant' && !registration.active) failed();
      });
    };
    watch(registration.installing);
    registration.addEventListener('updatefound', () => watch(registration.installing));
    return navigator.serviceWorker.ready;
  }).then(() => {
    status.textContent = '離線準備完成：可離線開啟，並使用全部內建行情。';
  }).catch(failed);
})();
