const service = require('../../services/testimonial.service');

async function index(req, res) {
  const testimonials = await service.listTestimonials();
  const flash = {
    error: req.session?.testimonialError || '',
    success: req.session?.testimonialSuccess || ''
  };
  if (req.session) {
    req.session.testimonialError = '';
    req.session.testimonialSuccess = '';
  }

  res.render('layouts/admin', {
    title: 'Kundenbewertungen',
    activeMenu: 'testimonials',
    body: 'testimonials',
    data: { testimonials, flash }
  });
}

function readPayload(body) {
  return {
    author_name: body?.author_name,
    quote: body?.quote,
    rating: body?.rating,
    is_active: body?.is_active ? 1 : 0,
    sort_order: body?.sort_order || 0
  };
}

async function create(req, res) {
  try {
    await service.createTestimonial(readPayload(req.body));
    if (req.session) req.session.testimonialSuccess = 'Bewertung gespeichert.';
  } catch (error) {
    if (req.session) {
      req.session.testimonialError =
        error?.message === 'author-and-quote-required'
          ? 'Bitte Name und Bewertungstext angeben.'
          : 'Bewertung konnte nicht gespeichert werden.';
    }
  }
  res.redirect('/admin/testimonials');
}

async function update(req, res) {
  try {
    await service.updateTestimonial(req.params.id, readPayload(req.body));
    if (req.session) req.session.testimonialSuccess = 'Bewertung aktualisiert.';
  } catch (error) {
    if (req.session) {
      req.session.testimonialError =
        error?.message === 'author-and-quote-required'
          ? 'Bitte Name und Bewertungstext angeben.'
          : 'Bewertung konnte nicht aktualisiert werden.';
    }
  }
  res.redirect('/admin/testimonials');
}

async function remove(req, res) {
  try {
    await service.deleteTestimonial(req.params.id);
    if (req.session) req.session.testimonialSuccess = 'Bewertung gelöscht.';
  } catch (_error) {
    if (req.session) req.session.testimonialError = 'Bewertung konnte nicht gelöscht werden.';
  }
  res.redirect('/admin/testimonials');
}

module.exports = { index, create, update, remove };
