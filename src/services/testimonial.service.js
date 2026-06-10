const { query } = require('../config/db');

let hasTestimonialTable = false;

const SEED_TESTIMONIALS = [
  {
    author_name: 'Sophie M.',
    quote:
      'Die Produkte sind einfach traumhaft - die Qualität und der Duft übertreffen alles. Mein Favorit ist das Keratin Gloss Serum.',
    rating: 5,
    sort_order: 1
  },
  {
    author_name: 'Lena K.',
    quote:
      'Ich bin verliebt in die Satin Kollektion. Das Slip Dress sitzt perfekt und fuehlt sich luxurioes an. BarBae ist meine Lieblingsmarke.',
    rating: 5,
    sort_order: 2
  },
  {
    author_name: 'Anna W.',
    quote:
      'Endlich ein Shop, der Beauty und Fashion vereint. Die Bridal Box war das perfekte Geschenk für meine beste Freundin.',
    rating: 5,
    sort_order: 3
  }
];

async function ensureTestimonialTable() {
  if (hasTestimonialTable) return;

  await query(`
    CREATE TABLE IF NOT EXISTS testimonials (
      id INT AUTO_INCREMENT PRIMARY KEY,
      author_name VARCHAR(190) NOT NULL,
      quote TEXT NOT NULL,
      rating TINYINT NOT NULL DEFAULT 5,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      sort_order INT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  const existing = await query('SELECT COUNT(*) AS total FROM testimonials');
  if (Number(existing?.[0]?.total || 0) === 0) {
    for (const item of SEED_TESTIMONIALS) {
      await query(
        'INSERT INTO testimonials (author_name, quote, rating, is_active, sort_order) VALUES (?, ?, ?, 1, ?)',
        [item.author_name, item.quote, item.rating, item.sort_order]
      );
    }
  }

  hasTestimonialTable = true;
}

function normalizeRating(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 5;
  return Math.max(1, Math.min(5, Math.round(num)));
}

async function listTestimonials() {
  await ensureTestimonialTable();
  return query(
    `SELECT id, author_name, quote, rating, is_active, sort_order, created_at, updated_at
     FROM testimonials
     ORDER BY sort_order ASC, id ASC`
  );
}

async function listActiveTestimonials(limit = 12) {
  await ensureTestimonialTable();
  const safeLimit = Math.max(1, Math.min(50, Number(limit) || 12));
  return query(
    `SELECT id, author_name, quote, rating, sort_order
     FROM testimonials
     WHERE is_active = 1
     ORDER BY sort_order ASC, id ASC
     LIMIT ${safeLimit}`
  );
}

async function getTestimonialById(id) {
  await ensureTestimonialTable();
  const rows = await query(
    'SELECT id, author_name, quote, rating, is_active, sort_order FROM testimonials WHERE id = ? LIMIT 1',
    [Number(id)]
  );
  return rows[0] || null;
}

async function createTestimonial(payload) {
  await ensureTestimonialTable();
  const authorName = String(payload?.author_name || '').trim();
  const quote = String(payload?.quote || '').trim();
  if (!authorName || !quote) {
    throw new Error('author-and-quote-required');
  }
  await query(
    'INSERT INTO testimonials (author_name, quote, rating, is_active, sort_order) VALUES (?, ?, ?, ?, ?)',
    [
      authorName.slice(0, 190),
      quote,
      normalizeRating(payload?.rating ?? 5),
      payload?.is_active ? 1 : 0,
      Math.max(0, Number(payload?.sort_order || 0))
    ]
  );
}

async function updateTestimonial(id, payload) {
  await ensureTestimonialTable();
  const authorName = String(payload?.author_name || '').trim();
  const quote = String(payload?.quote || '').trim();
  if (!authorName || !quote) {
    throw new Error('author-and-quote-required');
  }
  await query(
    `UPDATE testimonials
     SET author_name = ?, quote = ?, rating = ?, is_active = ?, sort_order = ?, updated_at = NOW()
     WHERE id = ?`,
    [
      authorName.slice(0, 190),
      quote,
      normalizeRating(payload?.rating ?? 5),
      payload?.is_active ? 1 : 0,
      Math.max(0, Number(payload?.sort_order || 0)),
      Number(id)
    ]
  );
}

async function deleteTestimonial(id) {
  await ensureTestimonialTable();
  await query('DELETE FROM testimonials WHERE id = ?', [Number(id)]);
}

module.exports = {
  ensureTestimonialTable,
  listTestimonials,
  listActiveTestimonials,
  getTestimonialById,
  createTestimonial,
  updateTestimonial,
  deleteTestimonial
};
