const { query } = require('../config/db');

let blogSchemaReady = false;

function cleanSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function toInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function sanitizeUrl(url) {
  const value = String(url || '').trim();
  if (!value) return '';
  if (/^(https?:\/\/|\/)/i.test(value)) return value;
  return '';
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeHtml(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';

  let html = raw;
  if (!/<[a-z!/][^>]*>/i.test(html)) {
    html = html
      .replace(/\r\n/g, '\n')
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
      .join('\n');
  }

  html = html.replace(/<!--[\s\S]*?-->/g, '');
  html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  html = html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');

  const allowed = new Set([
    'p',
    'br',
    'strong',
    'b',
    'em',
    'i',
    'ul',
    'ol',
    'li',
    'h2',
    'h3',
    'h4',
    'blockquote',
    'a',
    'img'
  ]);

  html = html.replace(/<a\b([^>]*)>/gi, (_m, attrs) => {
    const hrefMatch = String(attrs || '').match(/href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const href = sanitizeUrl(hrefMatch ? hrefMatch[2] || hrefMatch[3] || hrefMatch[4] : '');
    const targetBlank = /target\s*=\s*("_blank"|'_blank'|_blank)/i.test(String(attrs || ''));
    if (!href) return '<a>';
    return targetBlank
      ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">`
      : `<a href="${escapeHtml(href)}">`;
  });

  html = html.replace(/<img\b([^>]*)>/gi, (_m, attrs) => {
    const srcMatch = String(attrs || '').match(/src\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const altMatch = String(attrs || '').match(/alt\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const src = sanitizeUrl(srcMatch ? srcMatch[2] || srcMatch[3] || srcMatch[4] : '');
    const alt = altMatch ? String(altMatch[2] || altMatch[3] || altMatch[4] || '') : '';
    if (!src) return '';
    return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}">`;
  });

  html = html.replace(/<\/?([a-z0-9]+)\b[^>]*>/gi, (tag) => {
    const match = tag.match(/^<\s*(\/?)\s*([a-z0-9]+)/i);
    if (!match) return '';
    const closing = match[1] === '/';
    const name = String(match[2] || '').toLowerCase();
    if (!allowed.has(name)) return '';
    if (name === 'br') return '<br>';
    if (name === 'a') return closing ? '</a>' : tag;
    if (name === 'img') return tag;
    return closing ? `</${name}>` : `<${name}>`;
  });

  html = html.replace(/\son[a-z]+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, '');
  html = html.replace(/javascript:/gi, '');
  return html.trim();
}

function normalizePostPayload(payload = {}) {
  const title = String(payload.title || '').trim();
  const slug = cleanSlug(payload.slug || title);
  return {
    title,
    slug,
    category_label: String(payload.category_label || '').trim() || 'BarBae Magazin',
    excerpt: String(payload.excerpt || '').trim(),
    hero_image_url: sanitizeUrl(payload.hero_image_url),
    cover_image_alt: String(payload.cover_image_alt || '').trim(),
    author_name: String(payload.author_name || '').trim() || 'BarBae Redaktion',
    author_role: String(payload.author_role || '').trim(),
    read_time_minutes: Math.max(1, toInt(payload.read_time_minutes, 4)),
    content_html: sanitizeHtml(payload.content_html || ''),
    is_published: Number(String(payload.is_published || '1') === '1'),
    is_featured: Number(String(payload.is_featured || '') === '1'),
    sort_order: toInt(payload.sort_order, 0),
    published_at: String(payload.published_at || '').trim() || null
  };
}

async function ensureBlogSchema() {
  if (blogSchemaReady) return;

  await query(
    `CREATE TABLE IF NOT EXISTS blog_posts (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      title VARCHAR(255) NOT NULL,
      slug VARCHAR(255) NOT NULL,
      category_label VARCHAR(120) NULL,
      excerpt TEXT NULL,
      hero_image_url VARCHAR(500) NULL,
      cover_image_alt VARCHAR(255) NULL,
      author_name VARCHAR(190) NULL,
      author_role VARCHAR(190) NULL,
      read_time_minutes INT UNSIGNED NOT NULL DEFAULT 4,
      content_html MEDIUMTEXT NULL,
      is_published TINYINT(1) NOT NULL DEFAULT 1,
      is_featured TINYINT(1) NOT NULL DEFAULT 0,
      sort_order INT NOT NULL DEFAULT 0,
      published_at DATETIME NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_blog_posts_slug (slug)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );

  const countRows = await query('SELECT COUNT(*) AS count FROM blog_posts');
  if (Number(countRows[0]?.count || 0) === 0) {
    let imageA = '/favicon.svg';
    let imageB = '/favicon.svg';
    let imageC = '/favicon.svg';
    try {
      const products = await query(
        `SELECT featured_image FROM products
         WHERE featured_image IS NOT NULL AND featured_image <> ''
         ORDER BY is_bestseller DESC, created_at DESC
         LIMIT 3`
      );
      if (products[0]?.featured_image) imageA = String(products[0].featured_image).startsWith('/') ? products[0].featured_image : `/${products[0].featured_image}`;
      if (products[1]?.featured_image) imageB = String(products[1].featured_image).startsWith('/') ? products[1].featured_image : `/${products[1].featured_image}`;
      if (products[2]?.featured_image) imageC = String(products[2].featured_image).startsWith('/') ? products[2].featured_image : `/${products[2].featured_image}`;
    } catch (_e) {
      // Product table may not be available in some setups; keep fallbacks.
    }

    const seedPosts = [
      {
        title: 'Glow Routine: 5 Schritte für einen gepflegten BarBae Look',
        slug: 'glow-routine-5-schritte-barbae-look',
        category_label: 'Beauty Journal',
        excerpt:
          'Eine stilvolle Daily-Routine für mehr Glow im Alltag: von Reinigung bis Finish mit unseren BarBae Favoriten.',
        hero_image_url: imageA,
        cover_image_alt: 'Beauty Produkt Highlight für Glow Routine',
        author_name: 'BarBae Redaktion',
        author_role: 'Beauty',
        read_time_minutes: 4,
        is_published: 1,
        is_featured: 1,
        sort_order: 10,
        content_html: `
          <p>Ein gepflegter Glow beginnt nicht bei der letzten Schicht, sondern bei einer klaren Routine. Für BarBae bedeutet das: weniger Überladung, mehr Wirkung und Produkte, die sich harmonisch ergänzen.</p>
          <h3>1. Sanfte Vorbereitung</h3>
          <p>Starte mit einer milden Reinigung und bereite die Haut mit einer leichten Pflege auf die nächsten Schritte vor. Eine ruhige Basis sorgt für ein gleichmäßigeres Finish.</p>
          <h3>2. Fokus auf Feuchtigkeit</h3>
          <p>Feuchtigkeit ist die Grundlage für einen frischen Look. Arbeite in dünnen Schichten und gib den Produkten kurz Zeit, um einzuziehen.</p>
          <h3>3. Glow gezielt setzen</h3>
          <p>Setze Highlights nur dort, wo Licht natürlich trifft: Wangenknochen, Nasenrücken und oberhalb des Lippenbogens.</p>
          <img src="${imageA}" alt="BarBae Glow Routine Produktbild">
          <h3>4. Styling mit Balance</h3>
          <p>Wenn der Fokus auf dem Glow liegt, wirken reduzierte Details besonders elegant. Ein klarer Look wirkt oft hochwertiger als zu viele Akzente gleichzeitig.</p>
          <h3>5. Finish für den Alltag</h3>
          <p>Zum Abschluss ein leichtes Finish für Haltbarkeit und ein natürliches Ergebnis. So bleibt der Look auch im Alltag stilvoll und tragbar.</p>
        `
      },
      {
        title: 'Bridal & Events: Elegante Looks, die auf Fotos bestehen',
        slug: 'bridal-events-elegante-looks-fuer-fotos',
        category_label: 'Style Guide',
        excerpt:
          'Was einen hochwertigen Event-Look ausmacht und wie du Beauty und Stil für Bridal, Dinner oder Shooting kombinierst.',
        hero_image_url: imageB,
        cover_image_alt: 'Eleganter Bridal oder Event Look',
        author_name: 'BarBae Redaktion',
        author_role: 'Styles',
        read_time_minutes: 5,
        is_published: 1,
        is_featured: 1,
        sort_order: 20,
        content_html: `
          <p>Für besondere Anlässe braucht es einen Look, der live elegant wirkt und auf Fotos klar, weich und hochwertig aussieht. Genau dafür lohnt sich ein kuratierter Ansatz.</p>
          <h3>Weniger Trends, mehr Linie</h3>
          <p>Statt jedem Trend zu folgen, wirkt eine saubere Linie aus Farbwelt, Texturen und wenigen Akzenten deutlich hochwertiger. Das gilt besonders für Bridal und Event-Styling.</p>
          <img src="${imageB}" alt="BarBae Bridal und Event Styling">
          <h3>Beauty und Outfit gemeinsam denken</h3>
          <ul>
            <li>Warme Töne mit goldenen Accessoires kombinieren</li>
            <li>Strukturierte Stoffe mit ruhigem Make-up ausbalancieren</li>
            <li>Highlights gezielt setzen statt flächig auftragen</li>
          </ul>
          <p>Ein stimmiger Look entsteht durch Balance. Wenn Beauty und Styling dieselbe Sprache sprechen, wirkt das Ergebnis automatisch exklusiver.</p>
        `
      },
      {
        title: 'BarBae Essentials: Welche Produkte in jedes Set gehören',
        slug: 'barbae-essentials-produkte-fuer-jedes-set',
        category_label: 'BarBae Essentials',
        excerpt:
          'Unsere Empfehlung für eine starke Basis: Essentials, die sich kombinieren lassen und in jedem curated Set funktionieren.',
        hero_image_url: imageC,
        cover_image_alt: 'BarBae Essentials Set',
        author_name: 'BarBae Redaktion',
        author_role: 'Curated Picks',
        read_time_minutes: 3,
        is_published: 1,
        is_featured: 0,
        sort_order: 30,
        content_html: `
          <p>Ein gutes Set sollte nicht nur schön aussehen, sondern im Alltag funktionieren. Deshalb setzen wir bei BarBae auf Essentials, die sich flexibel kombinieren lassen.</p>
          <h3>Unsere Set-Logik</h3>
          <p>Jedes Set braucht eine klare Rolle: Vorbereitung, Highlight und Finish. Dadurch bleibt die Auswahl übersichtlich und der Look wirkt trotzdem vollständig.</p>
          <img src="${imageC}" alt="BarBae Essentials Produktbild">
          <p>Wenn du dein Set zusammenstellst, achte auf eine konsistente Farb- und Stilwelt. So entsteht ein hochwertiger Gesamteindruck statt einzelner, unverbundener Produkte.</p>
        `
      }
    ];

    for (const post of seedPosts) {
      const n = normalizePostPayload(post);
      await query(
        `INSERT INTO blog_posts (
          title, slug, category_label, excerpt, hero_image_url, cover_image_alt,
          author_name, author_role, read_time_minutes, content_html,
          is_published, is_featured, sort_order, published_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW()))`,
        [
          n.title,
          n.slug,
          n.category_label,
          n.excerpt || null,
          n.hero_image_url || null,
          n.cover_image_alt || null,
          n.author_name || null,
          n.author_role || null,
          n.read_time_minutes,
          n.content_html || null,
          n.is_published,
          n.is_featured,
          n.sort_order,
          n.published_at
        ]
      );
    }
  }

  blogSchemaReady = true;
}

async function listAdminBlogPosts() {
  await ensureBlogSchema();
  return query(
    `SELECT id, title, slug, category_label, author_name, read_time_minutes, is_published, is_featured,
            hero_image_url, published_at, created_at, updated_at
     FROM blog_posts
     ORDER BY COALESCE(published_at, created_at) DESC, id DESC`
  );
}

async function getBlogPostById(id) {
  await ensureBlogSchema();
  const rows = await query('SELECT * FROM blog_posts WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

async function getBlogPostBySlug(slug) {
  await ensureBlogSchema();
  const rows = await query(
    `SELECT *
     FROM blog_posts
     WHERE slug = ? AND is_published = 1
     LIMIT 1`,
    [cleanSlug(slug)]
  );
  return rows[0] || null;
}

async function listPublishedBlogPosts(limit = 6) {
  await ensureBlogSchema();
  return query(
    `SELECT id, title, slug, category_label, excerpt, hero_image_url, cover_image_alt,
            author_name, author_role, read_time_minutes, published_at, is_featured
     FROM blog_posts
     WHERE is_published = 1
     ORDER BY is_featured DESC, sort_order DESC, COALESCE(published_at, created_at) DESC, id DESC
     LIMIT ?`,
    [Math.max(1, toInt(limit, 6))]
  );
}

async function listAllPublishedBlogPosts() {
  await ensureBlogSchema();
  return query(
    `SELECT id, title, slug, category_label, excerpt, hero_image_url, cover_image_alt,
            author_name, author_role, read_time_minutes, published_at, is_featured
     FROM blog_posts
     WHERE is_published = 1
     ORDER BY is_featured DESC, sort_order DESC, COALESCE(published_at, created_at) DESC, id DESC`
  );
}

async function createBlogPost(payload) {
  await ensureBlogSchema();
  const n = normalizePostPayload(payload);
  await query(
    `INSERT INTO blog_posts (
      title, slug, category_label, excerpt, hero_image_url, cover_image_alt,
      author_name, author_role, read_time_minutes, content_html,
      is_published, is_featured, sort_order, published_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      n.title,
      n.slug,
      n.category_label,
      n.excerpt || null,
      n.hero_image_url || null,
      n.cover_image_alt || null,
      n.author_name || null,
      n.author_role || null,
      n.read_time_minutes,
      n.content_html || null,
      n.is_published,
      n.is_featured,
      n.sort_order,
      n.published_at
    ]
  );
}

async function updateBlogPost(id, payload) {
  await ensureBlogSchema();
  const n = normalizePostPayload(payload);
  await query(
    `UPDATE blog_posts
     SET title = ?, slug = ?, category_label = ?, excerpt = ?, hero_image_url = ?, cover_image_alt = ?,
         author_name = ?, author_role = ?, read_time_minutes = ?, content_html = ?,
         is_published = ?, is_featured = ?, sort_order = ?, published_at = ?, updated_at = NOW()
     WHERE id = ?`,
    [
      n.title,
      n.slug,
      n.category_label,
      n.excerpt || null,
      n.hero_image_url || null,
      n.cover_image_alt || null,
      n.author_name || null,
      n.author_role || null,
      n.read_time_minutes,
      n.content_html || null,
      n.is_published,
      n.is_featured,
      n.sort_order,
      n.published_at,
      id
    ]
  );
}

async function deleteBlogPost(id) {
  await ensureBlogSchema();
  await query('DELETE FROM blog_posts WHERE id = ?', [id]);
}

module.exports = {
  ensureBlogSchema,
  listAdminBlogPosts,
  getBlogPostById,
  getBlogPostBySlug,
  listPublishedBlogPosts,
  listAllPublishedBlogPosts,
  createBlogPost,
  updateBlogPost,
  deleteBlogPost
};
