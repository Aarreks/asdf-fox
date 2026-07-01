'use strict';

// This module intentionally has no Node-only imports. It is bundled for the
// browser build as well as the CommonJS/ESM package entries.
const wordfreq = require('../data/wordfreq-en-2021.json');
const seed = require('../data/contemporary-entity-seed.json');

const STANDARD_LEET = new Map([
  ['0', 'o'],
  ['1', 'i'],
  ['!', 'i'],
  ['3', 'e'],
  ['4', 'a'],
  ['@', 'a'],
  ['5', 's'],
  ['$', 's'],
  ['7', 't'],
  ['+', 't']
]);

const optionalLocalOverlay = { entries: [], source: null };

const wordfreqEntries = Object.freeze(wordfreq.entries);
const wordfreqRank = new Map(wordfreqEntries.map((word, index) => [word, index + 1]));
const coverageEntries = [];
const coverageSourceByEntry = new Map();
for (const [entries, source] of [
  [seed.entries, 'coverage-only contemporary seed'],
  [optionalLocalOverlay.entries, optionalLocalOverlay.source || 'locally imported coverage overlay']
]) {
  for (const entry of entries) {
    if (wordfreqRank.has(entry) || coverageSourceByEntry.has(entry)) continue;
    coverageSourceByEntry.set(entry, source);
    coverageEntries.push(entry);
  }
}
const coverageRank = new Map(coverageEntries.map((word, index) => [word, wordfreqEntries.length + index + 1]));

function metadata() {
  return {
    wordfreqEntryCount: wordfreqEntries.length,
    coverageOnlyEntryCount: coverageEntries.length,
    importedCoverageOnlyEntryCount: optionalLocalOverlay.entries.length,
    totalEntryCount: wordfreqEntries.length + coverageEntries.length,
    sourceSnapshot: wordfreq.dataSnapshot,
    sourceProject: wordfreq.sourceProject,
    fallbackSource: seed.sources[0]
  };
}

function combinationCount(n, k) {
  const chosen = Math.min(k, n - k);
  let result = 1;
  for (let i = 1; i <= chosen; i += 1) result = (result * (n - chosen + i)) / i;
  return result;
}

function capitalizationAdjustment(raw) {
  const letters = [...raw].filter((character) => /[A-Za-z]/u.test(character));
  const letterCount = letters.length;
  const uppercasePositions = [];
  for (let index = 0; index < letterCount; index += 1) {
    if (letters[index] === letters[index].toUpperCase() && letters[index] !== letters[index].toLowerCase()) {
      uppercasePositions.push(index);
    }
  }

  if (letterCount < 2 || uppercasePositions.length === 0) {
    return { log10: 0, kind: 'lowercase spelling' };
  }
  if (uppercasePositions.length === letterCount) {
    return { log10: 0.06, kind: 'all-uppercase spelling' };
  }
  if (uppercasePositions.length === 1 && uppercasePositions[0] === 0) {
    return { log10: 0.03, kind: 'initial capitalization' };
  }

  // An attacker should try ordinary title case and all-uppercase forms early.
  // Only irregular mixed-case masks receive a visible, but capped, bonus.
  const maskChoices = combinationCount(letterCount, uppercasePositions.length);
  return {
    log10: Math.min(0.55, 0.12 + 0.3 * Math.log10(Math.max(1, maskChoices))),
    kind: 'irregular capitalization'
  };
}

function normalizeLeet(password) {
  let normalized = '';
  const substitutions = [];
  for (let index = 0; index < password.length; index += 1) {
    const raw = password[index];
    const lowered = raw.toLocaleLowerCase('en-US');
    const replacement = STANDARD_LEET.get(lowered);
    if (replacement) {
      normalized += replacement;
      substitutions.push({ index, raw, normalized: replacement });
    } else {
      normalized += lowered;
    }
  }
  return { normalized, substitutions };
}

function leetAdjustment(substitutionCount) {
  if (substitutionCount <= 0) return { log10: 0, count: 0 };
  // Standard mappings are cheap enough to try with a ruleset. Award only a
  // small bounded increment rather than treating each symbol as independent
  // random entropy.
  return {
    log10: Math.min(0.55, 0.06 + 0.13 * substitutionCount),
    count: substitutionCount
  };
}

function lookupToken(token) {
  const frequencyRank = wordfreqRank.get(token);
  const fallbackRank = coverageRank.get(token);
  if (!frequencyRank && !fallbackRank) return null;
  return {
    rank: frequencyRank || fallbackRank,
    source: frequencyRank ? 'wordfreq frequency-ranked snapshot' : coverageSourceByEntry.get(token),
    confidence: frequencyRank ? 'frequency-ranked' : 'coverage-only'
  };
}

function discoverMatches(password, normalized, mode, substitutions) {
  const matches = [];
  for (let start = 0; start < normalized.length; start += 1) {
    const maxEnd = Math.min(normalized.length, start + 32);
    for (let end = maxEnd; end >= start + 3; end -= 1) {
      const token = normalized.slice(start, end);
      const found = lookupToken(token);
      if (!found) continue;

      const localSubstitutions = substitutions.filter((substitution) => substitution.index >= start && substitution.index < end);
      if (mode === 'leet-normalized' && localSubstitutions.length === 0) continue;

      const raw = password.slice(start, end);
      const capitalization = capitalizationAdjustment(raw);
      const leet = leetAdjustment(localSubstitutions.length);
      matches.push({
        token,
        raw,
        start,
        end,
        ...found,
        matchMode: mode,
        caseKind: capitalization.kind,
        caseLog10Bonus: capitalization.log10,
        leetSubstitutionCount: leet.count,
        leetLog10Bonus: leet.log10,
        transformationLog10Bonus: capitalization.log10 + leet.log10
      });
    }
  }
  return matches;
}

function rawMatches(password) {
  const lowered = password.toLocaleLowerCase('en-US');
  const leet = normalizeLeet(password);
  const direct = discoverMatches(password, lowered, 'direct', []);
  const normalizedLeet = leet.substitutions.length
    ? discoverMatches(password, leet.normalized, 'leet-normalized', leet.substitutions)
    : [];
  return [...direct, ...normalizedLeet];
}

function isMeaningful(match) {
  // Short ordinary words are mostly handled by zxcvbn already. Five-letter
  // terms are retained for visible proper nouns such as mario, luigi, and
  // zelda, but scoring still requires a bounded whole-password parse.
  return match.confidence === 'coverage-only' ? match.token.length >= 5 : match.token.length >= 5;
}

function removeContainedMatches(matches) {
  const meaningful = matches.filter(isMeaningful)
    .sort((a, b) => (b.token.length - a.token.length)
      || (a.rank - b.rank)
      || (a.start - b.start)
      || (a.transformationLog10Bonus - b.transformationLog10Bonus));
  const kept = [];
  const seen = new Set();
  for (const match of meaningful) {
    const key = `${match.start}:${match.end}:${match.token}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const swallowed = kept.some((other) => other.start <= match.start
      && other.end >= match.end
      && other.token.length > match.token.length);
    if (!swallowed) kept.push(match);
  }
  return kept
    .sort((a, b) => (a.start - b.start) || (b.token.length - a.token.length) || (a.rank - b.rank))
    .slice(0, 18);
}

function findModernLexiconMatches(password) {
  return removeContainedMatches(rawMatches(password));
}

function matchCost(match) {
  return Math.log10(match.rank) + match.transformationLog10Bonus;
}

function scoreLexiconAware(password, baseScore) {
  const baseline = baseScore(password);
  const matches = findModernLexiconMatches(password);
  if (matches.length === 0) {
    return { baseline, effectiveLog10: baseline.guessesLog10, changed: false, matches, composition: null };
  }

  const byStart = new Map();
  for (const match of matches) {
    if (!byStart.has(match.start)) byStart.set(match.start, []);
    byStart.get(match.start).push(match);
  }

  // Find adjacent recognized terms inside a bounded core span. Literal material
  // may occur only at the ends and is separately scored by zxcvbn. This catches
  // forms such as `13flareonvaporeon` and `homoflAreon62` without mining an
  // arbitrary interior substring from a long unrelated password.
  const proposals = [];
  const memo = new Map();
  const fullCover = (position, end) => {
    const key = `${position}:${end}`;
    if (memo.has(key)) return memo.get(key);
    if (position === end) return { cost: 0, matches: [] };
    let best = null;
    for (const match of byStart.get(position) || []) {
      if (match.end > end) continue;
      const rest = fullCover(match.end, end);
      if (!rest) continue;
      const candidate = {
        cost: matchCost(match) + rest.cost + (rest.matches.length ? 0.2 : 0),
        matches: [match, ...rest.matches]
      };
      if (!best || candidate.cost < best.cost) best = candidate;
    }
    memo.set(key, best);
    return best;
  };

  const maxLiteralEdge = Math.min(8, password.length);
  for (let prefixLength = 0; prefixLength <= maxLiteralEdge; prefixLength += 1) {
    for (let suffixLength = 0; suffixLength <= maxLiteralEdge; suffixLength += 1) {
      const coreStart = prefixLength;
      const coreEnd = password.length - suffixLength;
      if (coreEnd <= coreStart) continue;
      if (prefixLength === 0 && suffixLength === 0) {
        // Included naturally in the loop; no special handling needed.
      }
      const cover = fullCover(coreStart, coreEnd);
      if (!cover || cover.matches.length === 0) continue;
      const coveredChars = cover.matches.reduce((sum, match) => sum + (match.end - match.start), 0);
      if (coveredChars / password.length < 0.5) continue;

      let cost = cover.cost;
      const literalSegments = [];
      if (prefixLength > 0) {
        const text = password.slice(0, prefixLength);
        cost += baseScore(text).guessesLog10 + 0.12;
        literalSegments.push({ side: 'prefix', text, log10: baseScore(text).guessesLog10 });
      }
      if (suffixLength > 0) {
        const text = password.slice(coreEnd);
        cost += baseScore(text).guessesLog10 + 0.12;
        literalSegments.push({ side: 'suffix', text, log10: baseScore(text).guessesLog10 });
      }
      proposals.push({ cost, matches: cover.matches, literalSegments });
    }
  }

  const best = proposals.reduce((current, proposal) => (!current || proposal.cost < current.cost ? proposal : current), null);
  const changed = Boolean(best && best.cost + 1e-9 < baseline.guessesLog10);
  return {
    baseline,
    effectiveLog10: changed ? best.cost : baseline.guessesLog10,
    changed,
    matches,
    composition: changed ? {
      candidateLog10: best.cost,
      matches: best.matches,
      literalSegments: best.literalSegments
    } : null
  };
}

module.exports = {
  metadata,
  findModernLexiconMatches,
  scoreLexiconAware
};
