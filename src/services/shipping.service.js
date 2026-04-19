function toMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function normalizeWeightGrams(value) {
  const grams = Number(value || 0);
  if (!Number.isFinite(grams) || grams < 0) return 0;
  return Math.round(grams);
}

function calcCartWeightGrams(items = []) {
  return (Array.isArray(items) ? items : []).reduce((sum, item) => {
    const qty = Math.max(1, Number(item.qty || item.quantity || 1));
    const weightGrams = normalizeWeightGrams(item.weightGrams || item.weight_grams);
    return sum + qty * weightGrams;
  }, 0);
}

// Default domestic Austria parcel price model (Austrian Post / Paket Österreich style).
// Values can later be moved to admin settings.
const POST_AT_DOMESTIC_BRACKETS = [
  { maxWeightGrams: 1000, basePrice: 6.11, surcharge: 0.27, vatRate: 0 },
  { maxWeightGrams: 2000, basePrice: 7.39, surcharge: 0.27, vatRate: 0 },
  { maxWeightGrams: 4000, basePrice: 8.66, surcharge: 0.27, vatRate: 0 },
  { maxWeightGrams: 10000, basePrice: 12.48, surcharge: 0.27, vatRate: 0 },
  { maxWeightGrams: 31500, basePrice: 20.08, surcharge: 0.32, vatRate: 0.2 }
];

function calcAustrianPostDomesticShipping(weightGrams) {
  const normalized = Math.max(0, normalizeWeightGrams(weightGrams));
  if (normalized <= 0) {
    return {
      provider: 'post-at',
      service: 'Paket Österreich',
      chargeableWeightGrams: 0,
      basePrice: 0,
      surcharge: 0,
      gross: 0,
      net: 0,
      tax: 0,
      vatRate: 0,
      bracketMaxWeightGrams: 0,
      isAvailable: true
    };
  }

  const bracket = POST_AT_DOMESTIC_BRACKETS.find((b) => normalized <= b.maxWeightGrams);
  if (!bracket) {
    return {
      provider: 'post-at',
      service: 'Paket Österreich',
      chargeableWeightGrams: normalized,
      gross: 0,
      net: 0,
      tax: 0,
      vatRate: 0,
      isAvailable: false,
      error: 'weight-exceeds-domestic-limit'
    };
  }

  const basePlusSurcharge = toMoney(Number(bracket.basePrice || 0) + Number(bracket.surcharge || 0));
  const vatRate = Number(bracket.vatRate || 0);
  const net = vatRate > 0 ? toMoney(basePlusSurcharge / (1 + vatRate)) : basePlusSurcharge;
  const tax = vatRate > 0 ? toMoney(basePlusSurcharge - net) : 0;

  return {
    provider: 'post-at',
    service: 'Paket Österreich',
    chargeableWeightGrams: normalized,
    basePrice: toMoney(bracket.basePrice),
    surcharge: toMoney(bracket.surcharge),
    gross: basePlusSurcharge,
    net,
    tax,
    vatRate,
    bracketMaxWeightGrams: bracket.maxWeightGrams,
    isAvailable: true
  };
}

function buildCheckoutShipping(items = [], options = {}) {
  const weightGrams = calcCartWeightGrams(items);
  const countryCode = String(options.countryCode || 'AT').trim().toUpperCase() || 'AT';
  const shippingMethod = String(options.shippingMethod || 'standard').trim().toLowerCase();
  if (shippingMethod === 'express') {
    const expressGross = toMoney(options.expressGross || 0);
    return {
      provider: 'manual-express',
      service: 'Express Versand',
      countryCode,
      chargeableWeightGrams: weightGrams,
      gross: expressGross,
      net: toMoney(expressGross / 1.2),
      tax: toMoney(expressGross - toMoney(expressGross / 1.2)),
      vatRate: 0.2,
      isAvailable: true
    };
  }
  if (countryCode !== 'AT') {
    return {
      provider: 'manual',
      service: 'Versand',
      countryCode,
      chargeableWeightGrams: weightGrams,
      gross: 0,
      net: 0,
      tax: 0,
      vatRate: 0,
      isAvailable: false,
      error: 'country-not-supported-yet'
    };
  }

  return {
    countryCode,
    ...calcAustrianPostDomesticShipping(weightGrams)
  };
}

module.exports = {
  calcCartWeightGrams,
  calcAustrianPostDomesticShipping,
  buildCheckoutShipping
};
