'use strict';

const { sha1 } = require('./sha1');

const RANGE_ENDPOINT = 'https://api.pwnedpasswords.com/range/';
const rangeCache = new Map();
const CACHE_LIMIT = 256;

function now() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function remember(prefix, suffixCounts) {
  if (rangeCache.size >= CACHE_LIMIT) rangeCache.delete(rangeCache.keys().next().value);
  rangeCache.set(prefix, suffixCounts);
}

function parseRangeResponse(text) {
  const suffixCounts = new Map();
  for (const line of text.split(/\r?\n/u)) {
    const [suffix, count] = line.split(':');
    if (suffix && count && Number(count) > 0) suffixCounts.set(suffix, Number(count));
  }
  return suffixCounts;
}

async function fetchRange(prefix, options) {
  if (rangeCache.has(prefix)) return { suffixCounts: rangeCache.get(prefix), source: 'memory cache' };
  const fetchImpl = options.fetch || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('No fetch implementation is available for Pwned Passwords lookup.');

  const endpoint = options.endpoint || RANGE_ENDPOINT;
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 5500;
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const response = await fetchImpl(`${endpoint}${prefix}`, {
      headers: { 'Add-Padding': 'true' },
      signal: controller?.signal
    });
    if (!response.ok) throw new Error(`HIBP returned HTTP ${response.status}`);
    const suffixCounts = parseRangeResponse(await response.text());
    remember(prefix, suffixCounts);
    return { suffixCounts, source: 'network' };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function checkCandidate(candidate, options) {
  const started = now();
  const digest = sha1(candidate.value);
  const prefix = digest.slice(0, 5);
  const suffix = digest.slice(5);
  try {
    const { suffixCounts, source } = await fetchRange(prefix, options);
    return {
      kind: candidate.kind,
      label: candidate.label,
      breached: suffixCounts.has(suffix),
      count: suffixCounts.get(suffix) || 0,
      state: 'checked',
      source,
      runtimeMs: now() - started
    };
  } catch (error) {
    return {
      kind: candidate.kind,
      label: candidate.label,
      breached: false,
      count: 0,
      state: 'unavailable',
      reason: error?.name === 'AbortError' ? 'HIBP request timed out' : 'HIBP lookup was unavailable',
      runtimeMs: now() - started
    };
  }
}

async function checkPwned(candidates, options = {}) {
  const started = now();
  const checks = await Promise.all(candidates.map((candidate) => checkCandidate(candidate, options)));
  return { checks, runtimeMs: now() - started };
}

function clearPwnedRangeCache() {
  rangeCache.clear();
}

module.exports = { checkPwned, clearPwnedRangeCache, parseRangeResponse, sha1 };
