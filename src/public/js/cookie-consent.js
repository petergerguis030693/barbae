(function () {
  var STORAGE_KEY = 'barbae_cookie_consent_v1';
  var BANNER_ID = 'barbae-cookie-banner';
  var MODAL_ID = 'barbae-cookie-modal';

  function getConfig() {
    return window.__COOKIE_CONSENT__ || { gaId: '' };
  }

  function readConsent() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function writeConsent(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {}
  }

  function loadGa4(measurementId) {
    if (!measurementId || window.__BARBAE_GA_LOADED__) return;
    window.__BARBAE_GA_LOADED__ = true;
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(measurementId);
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    function gtag() {
      window.dataLayer.push(arguments);
    }
    window.gtag = gtag;
    gtag('js', new Date());
    gtag('config', measurementId);
  }

  function applyFromStored() {
    var cfg = getConfig();
    var stored = readConsent();
    if (stored && stored.statistics && cfg.gaId) {
      loadGa4(cfg.gaId);
    }
  }

  function hideBanner() {
    var el = document.getElementById(BANNER_ID);
    if (el) el.hidden = true;
    try {
      document.documentElement.classList.add('barbae-consent-stored');
    } catch (e) {}
  }

  function showBanner() {
    var el = document.getElementById(BANNER_ID);
    if (el) el.hidden = false;
    try {
      document.documentElement.classList.remove('barbae-consent-stored');
    } catch (e) {}
  }

  function closeModal() {
    var m = document.getElementById(MODAL_ID);
    if (m) m.hidden = true;
    document.body.classList.remove('barbae-cookie-modal-open');
  }

  function openModal() {
    var m = document.getElementById(MODAL_ID);
    if (!m) return;
    var stored = readConsent();
    var stats = document.getElementById('barbae-consent-statistics');
    if (stats) stats.checked = !!(stored && stored.statistics);
    m.hidden = false;
    document.body.classList.add('barbae-cookie-modal-open');
  }

  function saveConsent(statistics) {
    writeConsent({
      v: 1,
      necessary: true,
      statistics: !!statistics,
      ts: Date.now()
    });
    applyFromStored();
    hideBanner();
    closeModal();
  }

  function bind() {
    var btnAll = document.getElementById('barbae-cookie-accept-all');
    var btnNecessary = document.getElementById('barbae-cookie-necessary');
    var btnSettings = document.getElementById('barbae-cookie-open-settings');
    var btnModalSave = document.getElementById('barbae-cookie-save-settings');
    var btnModalClose = document.getElementById('barbae-cookie-modal-close');
    var footerLink = document.getElementById('cookieSettingsLink');
    var modal = document.getElementById(MODAL_ID);

    if (btnAll) {
      btnAll.addEventListener('click', function () {
        saveConsent(true);
      });
    }
    if (btnNecessary) {
      btnNecessary.addEventListener('click', function () {
        saveConsent(false);
      });
    }
    if (btnSettings) {
      btnSettings.addEventListener('click', function () {
        openModal();
      });
    }
    if (btnModalSave) {
      btnModalSave.addEventListener('click', function () {
        var stats = document.getElementById('barbae-consent-statistics');
        saveConsent(stats ? stats.checked : false);
      });
    }
    if (btnModalClose) {
      btnModalClose.addEventListener('click', function () {
        closeModal();
      });
    }
    if (modal) {
      modal.addEventListener('click', function (e) {
        if (e.target === modal) closeModal();
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeModal();
    });
    if (footerLink) {
      footerLink.addEventListener('click', function (e) {
        e.preventDefault();
        openModal();
      });
    }

    var stored = readConsent();
    if (stored) {
      hideBanner();
      applyFromStored();
    } else {
      showBanner();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();
