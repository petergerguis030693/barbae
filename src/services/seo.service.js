const { query } = require('../config/db');

let seoTableReady = false;

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeUrl(url) {
  const value = String(url || '').trim();
  if (!value) return '';
  if (/^(https?:\/\/|\/|#|mailto:|tel:)/i.test(value)) {
    return value;
  }
  return '';
}

/** URL-Pfad ohne führende/abschließende Slashes (z. B. "agb", nicht "/agb") */
function normalizeSlug(value) {
  return String(value || '')
    .trim()
    .replace(/^\/+/g, '')
    .replace(/\/+$/g, '')
    .toLowerCase();
}

function slugLookupVariants(slug) {
  const clean = normalizeSlug(slug);
  if (!clean) return [];
  return Array.from(new Set([clean, `/${clean}`]));
}

function sanitizeSeoHtml(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;

  // Plain text input from admin: auto-format into paragraphs for nicer output.
  if (!/[<>&]/.test(raw) || !/<[a-z!/][^>]*>/i.test(raw)) {
    const paragraphs = raw
      .replace(/\r\n/g, '\n')
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`);
    return paragraphs.join('\n') || null;
  }

  let html = raw;
  html = html.replace(/<!--[\s\S]*?-->/g, '');
  html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  html = html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');

  html = html.replace(/<img\b[^>]*>/gi, (full) => {
    const srcMatch = full.match(/src\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const altMatch = full.match(/alt\s*=\s*("([^"]*)"|'([^']*)')/i);
    let src = srcMatch ? srcMatch[2] || srcMatch[3] || srcMatch[4] : '';
    src = String(src || '').trim();
    if (!/^(\/|https?:\/\/)/i.test(src)) return '';
    const alt = altMatch ? altMatch[2] || altMatch[3] : '';
    return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy" />`;
  });

  const allowed = new Set([
    'p',
    'br',
    'hr',
    'strong',
    'b',
    'em',
    'i',
    'u',
    'ul',
    'ol',
    'li',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'blockquote',
    'a',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
    'figure',
    'figcaption',
    'div',
    'span'
  ]);

  html = html.replace(/<a\b([^>]*)>/gi, (_m, attrs) => {
    const hrefMatch = String(attrs || '').match(/href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const href = sanitizeUrl(hrefMatch ? hrefMatch[2] || hrefMatch[3] || hrefMatch[4] : '');
    if (!href) return '<a>';
    const targetBlank = /target\s*=\s*("_blank"|'_blank'|_blank)/i.test(String(attrs || ''));
    return targetBlank
      ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">`
      : `<a href="${escapeHtml(href)}">`;
  });

  html = html.replace(/<\/?([a-z0-9]+)\b[^>]*>/gi, (tag) => {
    const match = tag.match(/^<\s*(\/?)\s*([a-z0-9]+)/i);
    if (!match) return '';
    const closing = match[1] === '/';
    const name = String(match[2] || '').toLowerCase();
    if (!allowed.has(name)) return '';
    if (name === 'br') return '<br>';
    if (name === 'hr') return '<hr>';
    if (name === 'a') return tag.startsWith('</') ? '</a>' : tag;
    return closing ? `</${name}>` : `<${name}>`;
  });

  html = html.replace(/\son[a-z]+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, '');
  html = html.replace(/javascript:/gi, '');

  return html.trim() || null;
}

function normalizeSeoPayload(payload = {}) {
  const isPublic =
    payload.is_public_route === true || payload.is_public_route === '1' || Number(payload.is_public_route) === 1;
  return {
    ...payload,
    slug: normalizeSlug(payload.slug),
    is_public_route: isPublic ? 1 : 0,
    seo_text: sanitizeSeoHtml(payload.seo_text)
  };
}

const DEFAULT_SEO_PAGES = [
  {
    title: 'Store Startseite',
    slug: 'store-home',
    meta_title: 'BarBae Shop | Beauty, Styles & Sets',
    meta_description: 'Entdecke Beauty, Styles und kuratierte Sets bei BarBae. Hochwertige Produkte, stilvolle Looks und exklusive Highlights online bestellen.',
    seo_text:
      'Willkommen bei BarBae. In unserem Online-Shop findest du ausgewählte Beauty-Produkte, stilvolle Essentials und kuratierte Sets für deinen Alltag. Wir verbinden Ästhetik, Qualität und eine klare Produktauswahl für Kundinnen und Kunden, die Wert auf ein hochwertiges Einkaufserlebnis legen. Entdecke neue Highlights, Bestseller und saisonale Favoriten direkt auf unserer Startseite.',
    focus_keyword: 'Beauty Shop',
    robots: 'index,follow'
  },
  {
    title: 'Checkout',
    slug: 'store-checkout',
    meta_title: 'Checkout | BarBae',
    meta_description: 'Sicherer Checkout bei BarBae. Bestellungen bequem abschließen, Kundendaten verwalten und Zahlungsart auswählen.',
    seo_text:
      'Im BarBae Checkout kannst du deine Bestellung sicher und bequem abschließen. Prüfe deine ausgewählten Produkte, hinterlege deine Lieferdaten und wähle die passende Zahlungsart. Unser Checkout ist auf eine schnelle und übersichtliche Bestellabwicklung ausgelegt.',
    focus_keyword: 'Checkout',
    robots: 'noindex,follow'
  },
  {
    title: 'Kundenkonto',
    slug: 'store-account',
    meta_title: 'Kundenkonto | BarBae',
    meta_description: 'Verwalte dein BarBae Kundenkonto: Bestellungen, Adressen, Nachrichten und persönliche Daten.',
    seo_text:
      'Im BarBae Kundenkonto verwaltest du deine Bestellungen, Adressen und Profildaten zentral an einem Ort. Zusätzlich findest du hier wichtige Nachrichten, Newsletter-Informationen und deine persönlichen Konto-Einstellungen.',
    focus_keyword: 'Kundenkonto',
    robots: 'noindex,follow'
  },
  {
    title: 'Passwort vergessen',
    slug: 'store-account-forgot-password',
    meta_title: 'Passwort vergessen | BarBae',
    meta_description: 'Passwort für dein BarBae Kundenkonto zurücksetzen.',
    seo_text:
      'Wenn du dein Passwort vergessen hast, kannst du hier einen sicheren Reset-Link für dein BarBae Kundenkonto anfordern. Aus Sicherheitsgründen ist der Link zeitlich begrenzt.',
    focus_keyword: 'Passwort zurücksetzen',
    robots: 'noindex,nofollow'
  },
  {
    title: 'Passwort Reset',
    slug: 'store-account-reset-password',
    meta_title: 'Neues Passwort setzen | BarBae',
    meta_description: 'Setze ein neues Passwort für dein BarBae Kundenkonto.',
    seo_text:
      'Setze hier ein neues Passwort für dein BarBae Kundenkonto. Achte auf ein sicheres Passwort mit ausreichender Länge für den bestmöglichen Schutz deines Kontos.',
    focus_keyword: 'Neues Passwort',
    robots: 'noindex,nofollow'
  },
  {
    title: 'Bestellung erfolgreich',
    slug: 'store-checkout-success',
    meta_title: 'Bestellung erfolgreich | BarBae',
    meta_description: 'Vielen Dank für deine Bestellung bei BarBae.',
    seo_text:
      'Vielen Dank für deine Bestellung bei BarBae. Deine Bestelldaten wurden erfolgreich übermittelt und du erhältst eine Bestellbestätigung sowie die Rechnung per E-Mail. In deinem Kundenkonto kannst du den Bestellverlauf jederzeit einsehen.',
    focus_keyword: 'Bestellung erfolgreich',
    robots: 'noindex,nofollow'
  }
];

async function ensureSeoTableAndDefaults() {
  if (seoTableReady) return;
  await query(
    `CREATE TABLE IF NOT EXISTS seo_pages (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      title VARCHAR(190) NOT NULL,
      slug VARCHAR(190) NOT NULL,
      meta_title VARCHAR(255) NULL,
      meta_description VARCHAR(500) NULL,
      seo_text MEDIUMTEXT NULL,
      focus_keyword VARCHAR(190) NULL,
      og_title VARCHAR(255) NULL,
      og_description VARCHAR(500) NULL,
      canonical_url VARCHAR(500) NULL,
      robots VARCHAR(100) NULL DEFAULT 'index,follow',
      json_ld MEDIUMTEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_seo_pages_slug (slug)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );

  try {
    await query('ALTER TABLE seo_pages ADD COLUMN is_public_route TINYINT(1) NOT NULL DEFAULT 0');
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    if (!/Duplicate column name/i.test(msg)) throw err;
  }

  try {
    await query(`UPDATE seo_pages SET slug = TRIM(LEADING '/' FROM slug) WHERE slug LIKE '/%'`);
  } catch (_err) {
    // ignore
  }

  for (const page of DEFAULT_SEO_PAGES) {
    const rows = await query('SELECT id FROM seo_pages WHERE slug = ? LIMIT 1', [page.slug]);
    if (!rows.length) {
      const {
        title,
        slug,
        meta_title,
        meta_description,
        seo_text,
        focus_keyword,
        og_title,
        og_description,
        canonical_url,
        robots,
        json_ld
      } = page;
      await query(
        `INSERT INTO seo_pages (
          title, slug, meta_title, meta_description, seo_text, focus_keyword,
          og_title, og_description, canonical_url, robots, json_ld
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          title,
          slug,
          meta_title || null,
          meta_description || null,
          seo_text || null,
          focus_keyword || null,
          og_title || null,
          og_description || null,
          canonical_url || null,
          robots || 'index,follow',
          json_ld || null
        ]
      );
    }
  }

  seoTableReady = true;
}

async function listSeoPages() {
  await ensureSeoTableAndDefaults();
  return query('SELECT * FROM seo_pages ORDER BY title ASC');
}

async function getSeoPageById(id) {
  await ensureSeoTableAndDefaults();
  const rows = await query('SELECT * FROM seo_pages WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

async function getSeoPageBySlug(slug) {
  await ensureSeoTableAndDefaults();
  const variants = slugLookupVariants(slug);
  if (!variants.length) return null;
  const placeholders = variants.map(() => '?').join(', ');
  const rows = await query(`SELECT * FROM seo_pages WHERE slug IN (${placeholders}) LIMIT 1`, variants);
  return rows[0] || null;
}

async function getPublicCmsPageBySlug(slug) {
  await ensureSeoTableAndDefaults();
  const variants = slugLookupVariants(slug);
  if (!variants.length) return null;
  const placeholders = variants.map(() => '?').join(', ');
  // Shop-Systemseiten (store-*) nie unter /slug ausliefern; echte Inhaltsseiten (agb, impressum, …) schon.
  const rows = await query(
    `SELECT * FROM seo_pages WHERE slug IN (${placeholders}) AND slug NOT LIKE 'store-%' LIMIT 1`,
    variants
  );
  return rows[0] || null;
}

async function listContentPages() {
  await ensureSeoTableAndDefaults();
  return query(`SELECT * FROM seo_pages WHERE slug NOT LIKE 'store-%' ORDER BY title ASC`);
}

async function createSeoPage(payload) {
  await ensureSeoTableAndDefaults();
  const normalized = normalizeSeoPayload(payload);
  const {
    title,
    slug,
    meta_title,
    meta_description,
    seo_text,
    focus_keyword,
    og_title,
    og_description,
    canonical_url,
    robots,
    json_ld,
    is_public_route
  } = normalized;

  await query(
    `INSERT INTO seo_pages (
      title, slug, meta_title, meta_description, seo_text, focus_keyword,
      og_title, og_description, canonical_url, robots, json_ld, is_public_route
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      title,
      slug,
      meta_title || null,
      meta_description || null,
      seo_text || null,
      focus_keyword || null,
      og_title || null,
      og_description || null,
      canonical_url || null,
      robots || 'index,follow',
      json_ld || null,
      Number(is_public_route) === 1 ? 1 : 0
    ]
  );
}

async function updateSeoPage(id, payload) {
  await ensureSeoTableAndDefaults();
  const normalized = normalizeSeoPayload(payload);
  const {
    title,
    slug,
    meta_title,
    meta_description,
    seo_text,
    focus_keyword,
    og_title,
    og_description,
    canonical_url,
    robots,
    json_ld,
    is_public_route
  } = normalized;

  await query(
    `UPDATE seo_pages
     SET title = ?, slug = ?, meta_title = ?, meta_description = ?, seo_text = ?, focus_keyword = ?,
         og_title = ?, og_description = ?, canonical_url = ?, robots = ?, json_ld = ?, is_public_route = ?, updated_at = NOW()
     WHERE id = ?`,
    [
      title,
      slug,
      meta_title || null,
      meta_description || null,
      seo_text || null,
      focus_keyword || null,
      og_title || null,
      og_description || null,
      canonical_url || null,
      robots || 'index,follow',
      json_ld || null,
      Number(is_public_route) === 1 ? 1 : 0,
      id
    ]
  );
}

async function deleteSeoPage(id) {
  await ensureSeoTableAndDefaults();
  await query('DELETE FROM seo_pages WHERE id = ?', [id]);
}

module.exports = {
  listSeoPages,
  listContentPages,
  getSeoPageById,
  getSeoPageBySlug,
  getPublicCmsPageBySlug,
  createSeoPage,
  updateSeoPage,
  deleteSeoPage
};
