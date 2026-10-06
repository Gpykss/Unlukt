// functions/src/pricing.js
// Server-side prices. Ported 1:1 from the client so fans see the same numbers — but the SERVER's
// answer is what gets charged (a modified browser can no longer pick its own price).

const MINIMUM_VIDEO_PRICE = 5;
const MINIMUM_VOICE_PRICE = 3;
const CALL_DURATIONS = [15, 30, 60, 90];

const DEFAULT_TIERS = {
  supporter: { price: 9.99 },
  vip: { price: 19.99 },
  superfan: { price: 49.99 },
};

const SUB_DAYS = { daily: 1, weekly: 7, monthly: 30 };

const round2 = (n) => Math.round(Number(n) * 100) / 100;
const toMillis = (v) => {
  if (!v) return null;
  if (typeof v.toMillis === "function") return v.toMillis();
  if (v.seconds != null) return v.seconds * 1000;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
};

/** Tier from an active subscription doc (or null). */
function activeTier(sub, now = Date.now()) {
  // "cancelled" = won't renew; it's paid until expiresAt, so it still counts until then
  if (!sub || !["active", "cancelled"].includes(sub.status)) return null;
  const exp = toMillis(sub.expiresAt);
  if (exp && exp < now) return null;
  return sub.tier || "supporter";
}

const CALL_DISCOUNT = { supporter: 0, vip: 0.1, superfan: 0.2 };

/** Price of a 1-on-1 call (same maths as BookVideoCall/BookVoiceCall). */
function callPrice({ type, duration, creatorUser = {}, availability = {}, tier = null }) {
  const isVoice = type === "voice";
  const min = isVoice ? MINIMUM_VOICE_PRICE : MINIMUM_VIDEO_PRICE;
  const set = isVoice
    ? (availability.voiceCallPrice ?? creatorUser.voiceCallPrice)
    : (availability.videoCallPrice ?? creatorUser.videoCallPrice);
  const base = Math.max(min, Number(set) || min);
  const orig = round2((base * duration) / 30);
  const d = CALL_DISCOUNT[tier] || 0;
  return d > 0 ? round2(orig * (1 - d)) : orig;
}

/** First active creator discount (same priority as SubscribeModal). */
function activeDiscount(discounts, { isFirst = true } = {}) {
  if (!discounts) return null;
  return (discounts.limited_time?.active && discounts.limited_time)
    || (isFirst && discounts.first_month?.active && discounts.first_month)
    || (discounts.bundle?.active && discounts.bundle)
    || null;
}

/** Same as getPriceForDuration() in subscriptionService.js. */
function priceForDuration(monthlyPrice, duration, discount, creatorPrices) {
  let base;
  if (creatorPrices) {
    if (duration === "daily" && creatorPrices.daily != null) base = Number(creatorPrices.daily);
    else if (duration === "weekly" && creatorPrices.weekly != null) base = Number(creatorPrices.weekly);
    else base = Number(creatorPrices.monthly ?? monthlyPrice);
  } else {
    const mult = { daily: 0.1, weekly: 0.35, monthly: 1 };
    base = Number(monthlyPrice) * (mult[duration] ?? 1);
  }
  if (discount && discount.active) {
    const expiry = toMillis(discount.expiresAt) ?? Infinity;
    if (Date.now() < expiry) {
      if (discount.type === "bundle" && discount.bundlePrice && discount.bundleMonths && duration === "monthly") {
        return Math.max(0.5, round2(Number(discount.bundlePrice) / Number(discount.bundleMonths)));
      }
      const direct = duration === "monthly" ? discount.priceMonthly
        : duration === "weekly" ? discount.priceWeekly
          : duration === "daily" ? discount.priceDaily : null;
      if (direct != null && Number(direct) > 0) return Math.max(0.5, round2(direct));
      if (discount.percent) return Math.max(0.5, round2(base * (1 - discount.percent / 100)));
    }
  }
  return Math.max(0.5, round2(base));
}

/** Subscription price for a tier + duration, from the creator's own settings. */
function subscriptionPrice({ tier, duration, tiersDoc, creatorUser = {}, discounts, isFirst = true }) {
  if (!["supporter", "vip", "superfan"].includes(tier)) throw new Error("Unknown tier");
  if (!SUB_DAYS[duration]) throw new Error("Unknown duration");
  // VIP and Superfan are monthly memberships (same as the subscribe screen)
  if (tier !== "supporter" && duration !== "monthly") throw new Error("This tier is monthly only");
  const t = { ...DEFAULT_TIERS[tier], ...((tiersDoc && tiersDoc[tier]) || {}) };
  const monthly = Number(t.price || DEFAULT_TIERS[tier].price);
  const creatorPrices = {
    monthly,
    weekly: creatorUser.subscriptionPriceWeekly ?? null,
    daily: creatorUser.subscriptionPriceDaily ?? null,
  };
  if (duration !== "monthly" && !(Number(creatorPrices[duration]) > 0)) {
    throw new Error("This creator doesn't offer that duration");
  }
  return priceForDuration(monthly, duration, activeDiscount(discounts, { isFirst }), creatorPrices);
}

/** Live settings with defaults (same as normalizeLiveSettings in LiveSetup.jsx). */
function liveSettings(s = {}) {
  const D = {
    entryFree: true, entryPrice: 10, guestEnabled: true, guestPrice: 0, maxGuests: 1,
    questionsEnabled: true, questionPrice: 0, requestsEnabled: true,
    requestMenu: [{ label: "Shoutout", price: 5 }, { label: "Song request", price: 10 }],
    allowCustomRequest: true, customRequestMin: 5,
  };
  const m = { ...D, ...(s || {}) };
  const n = (v, min, fb) => {
    const x = Math.floor(Number(v));
    return Number.isFinite(x) && x >= min ? x : fb;
  };
  return {
    ...m,
    entryPrice: n(m.entryPrice, 1, 10),
    guestPrice: n(m.guestPrice, 0, 0),
    maxGuests: Math.min(4, n(m.maxGuests, 1, 1)),
    questionPrice: n(m.questionPrice, 0, 0),
    customRequestMin: n(m.customRequestMin, 1, 5),
    requestMenu: (Array.isArray(m.requestMenu) ? m.requestMenu : [])
      .map((i) => ({ label: String(i?.label || "").trim().slice(0, 40), price: n(i?.price, 1, 1) }))
      .filter((i) => i.label)
      .slice(0, 8),
  };
}

module.exports = {
  MINIMUM_VIDEO_PRICE, MINIMUM_VOICE_PRICE, CALL_DURATIONS, SUB_DAYS,
  round2, toMillis, activeTier, callPrice, subscriptionPrice, priceForDuration, liveSettings,
};
