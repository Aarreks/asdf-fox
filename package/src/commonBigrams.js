'use strict';

// Experimental, local-only common-bigram adjustment. This is deliberately a
// bounded correction for a word pair whose two words were selected
// independently. It is not a phrase or semantic model.
const bigramData = require('../data/common-bigrams-top100k.json');
const wordfreq = require('../data/wordfreq-en-2021.json');
const { zxcvbn } = require('./zxcvbn');

const DIRECTIONAL_ORDER_LOG10 = 0.15;
const EXPLICIT_SEPARATOR_LOG10 = 0.15;
const MAX_WORD_LENGTH = 24;
const TOKEN_BOUNDARY_LOG10 = 0.2;
const COMMON_WHOLE_WORD_RANK = 5_000;
const COMMON_WHOLE_WORD_BONUS_LOG10 = 0.75;
const MAX_WORD_RANK = 100_000;
const ALLOWED_SEPARATOR = /^[!@#$%^&*._+\-=?]$/u;

// The bundled wordfreq overlay starts at three-character terms. These common
// short terms are necessary to recover ordinary sequences such as `i_like` and
// `to_be`; their relative ranks are intentionally coarse because the bigram
// adjustment is capped by the easier word anyway.
const SHORT_WORD_RANKS = new Map([
  ['a', 1], ['i', 1],
  ['an', 4], ['am', 5], ['as', 6], ['at', 7], ['be', 8], ['by', 9],
  ['do', 10], ['go', 11], ['he', 12], ['if', 13], ['in', 14], ['is', 15],
  ['it', 16], ['me', 17], ['my', 18], ['no', 19], ['of', 20], ['on', 21],
  ['or', 22], ['so', 23], ['to', 24], ['up', 25], ['us', 26], ['we', 27],
  ['ya', 28], ['you', 29]
]);

const wordRank = new Map(wordfreq.entries.map((word, index) => [word, index + 1]));
const bigramCounts = new Map();
for (const [left, right, count] of bigramData.entries) {
  bigramCounts.set(`${left}\u0000${right}`, count);
}

function metadata() {
  return {
    entryCount: bigramData.entryCount,
    source: bigramData.source,
    sourceUrl: bigramData.sourceUrl,
    selection: bigramData.selection,
    directionalOrderLog10: DIRECTIONAL_ORDER_LOG10,
    explicitSeparatorLog10: EXPLICIT_SEPARATOR_LOG10,
    jointParsePolicy: 'A pair is not discounted when zxcvbn already recognizes its complete surface as one non-bruteforce match.'
  };
}

function rankOf(word) {
  const shortRank = SHORT_WORD_RANKS.get(word);
  if (shortRank) return shortRank;
  const rank = wordRank.get(word);
  return rank && rank <= MAX_WORD_RANK ? rank : null;
}

function segmentationCost(word, rank) {
  const wholeWordBonus = word.length >= 5 && rank <= COMMON_WHOLE_WORD_RANK
    ? COMMON_WHOLE_WORD_BONUS_LOG10
    : 0;
  return Math.max(0, Math.log10(rank) - wholeWordBonus);
}

function isBetterSegmentation(candidate, existing) {
  if (!existing) return true;
  if (candidate.uncoveredCharacters !== existing.uncoveredCharacters) {
    return candidate.uncoveredCharacters < existing.uncoveredCharacters;
  }
  if (candidate.cost < existing.cost - 1e-9) return true;
  if (Math.abs(candidate.cost - existing.cost) <= 1e-9 && candidate.words.length < existing.words.length) {
    return true;
  }
  return false;
}

// Recover recognized words even when an alphabetic run has literal residue at
// one or both edges. The residue remains in the original password and receives
// no bigram discount. This is a parse-only fallback: it lets `xnewyork`,
// `newyorkx`, and `xnewyorkx` retain the exact `new → york` evidence without
// deleting the surrounding characters or requiring a special one-character
// mutation rule.
function segmentAlphabeticRun(raw) {
  const text = raw.toLocaleLowerCase('en-US');
  const best = Array(text.length + 1).fill(null);
  best[0] = { uncoveredCharacters: 0, cost: 0, words: [] };

  for (let start = 0; start < text.length; start += 1) {
    const previous = best[start];
    if (!previous) continue;

    // Keep a literal character as uncovered residue. This affects only which
    // word spans can be recovered; the baseline score still accounts for it.
    const literal = {
      uncoveredCharacters: previous.uncoveredCharacters + 1,
      cost: previous.cost,
      words: previous.words
    };
    if (isBetterSegmentation(literal, best[start + 1])) {
      best[start + 1] = literal;
    }

    const maxEnd = Math.min(text.length, start + MAX_WORD_LENGTH);
    for (let end = start + 1; end <= maxEnd; end += 1) {
      const word = text.slice(start, end);
      const rank = rankOf(word);
      if (!rank) continue;
      const candidate = {
        uncoveredCharacters: previous.uncoveredCharacters,
        cost: previous.cost + segmentationCost(word, rank) + (previous.words.length ? TOKEN_BOUNDARY_LOG10 : 0),
        words: [...previous.words, { word, start, end, rank }]
      };
      if (isBetterSegmentation(candidate, best[end])) {
        best[end] = candidate;
      }
    }
  }

  return best[text.length];
}

function recoveredWordChains(password) {
  const runs = [];
  const matcher = /[A-Za-z]+/g;
  for (const match of password.matchAll(matcher)) {
    const raw = match[0];
    const start = match.index;
    const segmented = segmentAlphabeticRun(raw);
    if (!segmented || segmented.words.length === 0) continue;
    runs.push({
      start,
      end: start + raw.length,
      uncoveredCharacters: segmented.uncoveredCharacters,
      words: segmented.words.map((word) => ({
        ...word,
        start: start + word.start,
        end: start + word.end
      }))
    });
  }

  const chains = [];
  let active = null;
  for (const run of runs) {
    if (!active) {
      active = {
        words: [...run.words],
        uncoveredCharacters: run.uncoveredCharacters
      };
      continue;
    }

    const gap = password.slice(active.words.at(-1).end, run.words[0].start);
    if (gap.length === 1 && ALLOWED_SEPARATOR.test(gap)) {
      active.words.push(...run.words);
      active.uncoveredCharacters += run.uncoveredCharacters;
      continue;
    }

    chains.push(active);
    active = {
      words: [...run.words],
      uncoveredCharacters: run.uncoveredCharacters
    };
  }
  if (active) chains.push(active);
  return chains.filter((chain) => chain.words.length >= 2);
}

// The bigram table is a replacement model for two independently chosen words.
// It must not be stacked on a zxcvbn match that already compresses the exact
// same character span into one recognized token (for example, `bigdick`).
// In that case the baseline has already paid for a joint lexical choice; a
// second pair discount would count the same correlation twice.
function jointBaselineParse(password, start, end, scoreSegment) {
  const local = scoreSegment(password.slice(start, end));
  if (!Array.isArray(local.sequence)) return null;

  return local.sequence.find((piece) =>
    piece.pattern !== 'bruteforce' &&
    piece.i === 0 &&
    piece.j + 1 === end - start
  ) || null;
}

function pairCandidate(chain, index, password, scorer) {
  const left = chain.words[index];
  const right = chain.words[index + 1];
  const count = bigramCounts.get(`${left.word}\u0000${right.word}`);
  if (!count) return null;

  if (jointBaselineParse(password, left.start, right.end, scorer)) return null;

  // Words may be adjacent in the recovered token list while still having an
  // uncovered alphabetic character between them. Only exact adjacency or one
  // explicit allowed separator may carry a bigram discount.
  const gap = password.slice(left.end, right.start);
  const separator = gap.length === 0
    ? null
    : (gap.length === 1 && ALLOWED_SEPARATOR.test(gap) ? gap : null);
  if (gap.length !== 0 && !separator) return null;

  const leftLog10 = Math.log10(left.rank);
  const rightLog10 = Math.log10(right.rank);
  const independentLog10 = leftLog10 + rightLog10;
  const pairFloorLog10 = Math.max(leftLog10, rightLog10)
    + DIRECTIONAL_ORDER_LOG10
    + (separator ? EXPLICIT_SEPARATOR_LOG10 : 0);
  const reductionLog10 = Math.max(0, independentLog10 - pairFloorLog10);

  return {
    left: left.word,
    right: right.word,
    leftStart: left.start,
    leftEnd: left.end,
    rightStart: right.start,
    rightEnd: right.end,
    count,
    separator,
    leftRank: left.rank,
    rightRank: right.rank,
    independentLog10,
    pairFloorLog10,
    reductionLog10
  };
}

function selectNonOverlappingPairs(candidates) {
  const best = Array(candidates.length + 1).fill(null);
  best[0] = { reductionLog10: 0, selected: [] };

  for (let index = 0; index < candidates.length; index += 1) {
    const skip = best[index];
    const candidate = candidates[index];
    const takeBase = index > 0 ? best[index - 1] : best[0];
    const take = candidate
      ? {
        reductionLog10: takeBase.reductionLog10 + candidate.reductionLog10,
        selected: [...takeBase.selected, candidate]
      }
      : null;

    if (!take || skip.reductionLog10 >= take.reductionLog10 - 1e-9) {
      best[index + 1] = skip;
    } else {
      best[index + 1] = take;
    }
  }

  return best.at(-1);
}

function scoreCommonBigramPatterns(password, currentLog10, scoreSegment) {
  const scorer = typeof scoreSegment === 'function'
    ? scoreSegment
    : (text) => zxcvbn(text, []);

  const patterns = [];
  let totalReductionLog10 = 0;

  for (const chain of recoveredWordChains(password)) {
    const candidates = Array.from({ length: chain.words.length - 1 }, (_, index) => pairCandidate(chain, index, password, scorer));
    const hits = candidates.filter(Boolean);
    if (hits.length === 0) continue;

    const selection = selectNonOverlappingPairs(candidates);
    if (selection.reductionLog10 <= 0) continue;

    totalReductionLog10 += selection.reductionLog10;
    patterns.push({
      words: chain.words.map((word) => word.word),
      uncoveredCharacters: chain.uncoveredCharacters,
      hits,
      selectedPairs: selection.selected,
      reductionLog10: selection.reductionLog10
    });
  }

  // Every selected pair is charged no lower than its harder word plus an order
  // cost. The matching step prevents a central word from being discounted by
  // both adjacent bigrams.
  const effectiveLog10 = Math.max(0, currentLog10 - totalReductionLog10);
  return {
    effectiveLog10,
    changed: effectiveLog10 + 1e-9 < currentLog10,
    composition: patterns.length ? {
      candidateLog10: effectiveLog10,
      totalReductionLog10,
      patterns
    } : null
  };
}

module.exports = { metadata, scoreCommonBigramPatterns, segmentAlphabeticRun };
