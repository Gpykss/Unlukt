// src/services/payService.js
// Every in-app payment goes through the server (`spend` / `refund` Cloud Functions). The app only
// says what the fan wants; the server sets the price, moves the money and writes the records.
//
// Built for flaky Nigerian networks: each action gets ONE request id, reused on retry, so a
// timeout or dropped connection can be retried safely — the server charges at most once.

import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';

const newRequestId = () => {
  try { if (crypto?.randomUUID) return crypto.randomUUID(); } catch { /* old browsers */ }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
};

const RETRYABLE = ['functions/unavailable', 'functions/deadline-exceeded', 'functions/internal', 'functions/unknown'];

const friendly = (e) => {
  const code = e?.code || '';
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return "You're offline — reconnect and try again. You were not charged.";
  if (code === 'functions/deadline-exceeded' || code === 'functions/unavailable') {
    return "Network is slow — we couldn't confirm it. Check your wallet history before trying again.";
  }
  if (code === 'functions/resource-exhausted') return e.message || 'Too many requests — wait a moment.';
  if (code === 'functions/internal' || !e?.message) return 'Something went wrong — please try again.';
  return e.message; // the server's own explanation (e.g. "Insufficient balance…")
};

async function call(name, data, { timeout = 25000, retries = 2 } = {}) {
  const fn = httpsCallable(functions, name, { timeout });
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fn(data);
      return res.data;
    } catch (e) {
      lastErr = e;
      if (!RETRYABLE.includes(e?.code) || attempt === retries) break;
      await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
    }
  }
  const err = new Error(friendly(lastErr));
  err.code = lastErr?.code;
  throw err;
}

/**
 * Pay for something. kind: 'tip' | 'call' | 'subscription' | 'community' | 'live'.
 * Returns the server result (e.g. { bookingId, price, balanceAfter }).
 */
export const pay = (kind, data = {}) => call('spend', { ...data, kind, requestId: data.requestId || newRequestId() });

/** Refund: { kind: 'call', bookingId, reason } (cancel / reject / no-show) or { kind: 'live', messageId } (creator declines). */
export const refund = (kind, data = {}) => call('refund', { ...data, kind });

/** Is this creator already booked? → { busy, scheduledAt } */
export const getCreatorCallStatus = (creatorId) => call('callStatus', { creatorId }, { retries: 1, timeout: 15000 });

/** Release an older booking's earning to the creator once the call completed. */
export const releaseCallEarning = (bookingId) => call('callStatus', { action: 'release', bookingId }, { retries: 1 });

/** Ambassador: move commission into withdrawable earnings. → { moved } */
export const claimAmbassadorBalance = () => call('claimAmbassador', {});

/** Creator withdrawal request (server checks the real balance and sets the fee). */
export const requestWithdrawal = ({ amount, address }) =>
  call('requestPayout', { amountMinor: Math.round(Number(amount) * 100), payoutAddress: String(address || '').trim() }, { retries: 0 });

export { newRequestId };
