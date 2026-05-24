const CAPTCHA_TTL_MS = 30 * 60 * 1000;
const MIN_FORM_TIME_MS = 2500;

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function buildQuestion() {
  const operators = ['+', '-'];
  const op = operators[Math.floor(Math.random() * operators.length)];
  let a = randomInt(2, 12);
  let b = randomInt(1, 9);

  if (op === '-') {
    if (b > a) {
      const tmp = a;
      a = b;
      b = tmp;
    }
    return { question: `${a} - ${b}`, answer: a - b };
  }

  return { question: `${a} + ${b}`, answer: a + b };
}

function getOrCreateRegisterCaptcha(req) {
  const now = Date.now();
  const existing = req.session?.registerCaptcha || null;

  if (existing && existing.expiresAt && existing.expiresAt > now && Number.isFinite(existing.answer)) {
    return existing;
  }

  const generated = buildQuestion();
  const captcha = {
    question: generated.question,
    answer: generated.answer,
    createdAt: now,
    expiresAt: now + CAPTCHA_TTL_MS
  };

  if (req.session) {
    req.session.registerCaptcha = captcha;
  }
  return captcha;
}

function clearRegisterCaptcha(req) {
  if (req.session) {
    delete req.session.registerCaptcha;
  }
}

function validateRegisterCaptcha(req, body = {}) {
  const captcha = req.session?.registerCaptcha;
  const honeypot = String(body.website || '').trim();
  if (honeypot) {
    return { ok: false, reason: 'honeypot' };
  }

  if (!captcha || !Number.isFinite(captcha.answer)) {
    return { ok: false, reason: 'expired' };
  }

  if (captcha.expiresAt && captcha.expiresAt < Date.now()) {
    return { ok: false, reason: 'expired' };
  }

  const elapsed = Date.now() - Number(captcha.createdAt || 0);
  if (elapsed < MIN_FORM_TIME_MS) {
    return { ok: false, reason: 'too-fast' };
  }

  const userAnswerRaw = String(body.captcha_answer || '').trim();
  if (!/^-?\d+$/.test(userAnswerRaw)) {
    return { ok: false, reason: 'invalid' };
  }

  if (Number(userAnswerRaw) !== Number(captcha.answer)) {
    return { ok: false, reason: 'wrong' };
  }

  return { ok: true };
}

module.exports = {
  getOrCreateRegisterCaptcha,
  validateRegisterCaptcha,
  clearRegisterCaptcha
};
