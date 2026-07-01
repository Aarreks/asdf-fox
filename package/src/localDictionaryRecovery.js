'use strict';

// This is intentionally a narrow recovery pass, not general phrase scoring.
// It only revisits a generic-bruteforce span selected by the full zxcvbn parse.
// A local zxcvbn run may find ordinary dictionary coverage that was missed when
// the surrounding password was optimized as one global parse.
const MIN_SPAN_LENGTH = 4;
const MIN_DICTIONARY_COVERAGE = 0.6;
const MIN_LOG10_SAVINGS = 0.75;
const MIN_SINGLE_DICTIONARY_PIECE_LENGTH = 4;
const LOCAL_PARSE_LAYOUT_LOG10 = 0.15;
const EDGE_SEPARATOR_LOG10 = 0.15;
const MAX_SPANS_TO_INSPECT = 3;
const EDGE_SEPARATOR = /^[!@#$%^&*._+\-=?]$/u;

function selectedDictionaryPieces(local) {
  return local.sequence
    .filter((piece) => piece.pattern === 'dictionary' && !piece.reversed)
    .map((piece) => ({
      token: piece.token,
      matchedWord: piece.matchedWord,
      start: piece.i,
      end: piece.j + 1,
      dictionaryName: piece.dictionaryName,
      l33t: Boolean(piece.l33t)
    }));
}

function dictionaryEvidence(dictionaryPieces, textLength) {
  const coveredCharacters = dictionaryPieces.reduce((total, piece) => total + (piece.end - piece.start), 0);
  const dictionaryCoverage = coveredCharacters / textLength;
  const longestPieceLength = dictionaryPieces.reduce(
    (longest, piece) => Math.max(longest, piece.end - piece.start),
    0
  );

  // A lone three-character match is too easy to find accidentally inside a
  // generic span. Require either one 4+ character piece or two pieces.
  const meaningfulPieces =
    dictionaryPieces.length >= 2 || longestPieceLength >= MIN_SINGLE_DICTIONARY_PIECE_LENGTH;

  return { dictionaryCoverage, meaningfulPieces };
}

function localParseCandidates(text) {
  const candidates = [{ localText: text, separatorLog10: 0 }];

  // A single common separator at either edge can prevent zxcvbn from choosing
  // an otherwise complete dictionary parse. Recheck only that core and charge
  // a small explicit cost for the separator. Never strip multiple characters.
  if (text.length - 1 >= MIN_SPAN_LENGTH && EDGE_SEPARATOR.test(text.at(-1))) {
    candidates.push({ localText: text.slice(0, -1), separatorLog10: EDGE_SEPARATOR_LOG10 });
  }
  if (text.length - 1 >= MIN_SPAN_LENGTH && EDGE_SEPARATOR.test(text[0])) {
    candidates.push({ localText: text.slice(1), separatorLog10: EDGE_SEPARATOR_LOG10 });
  }

  return candidates;
}

function normalizedWholePasswordFloor(password, span, parse, baseScore) {
  if (parse.separatorLog10 <= 0) return null;

  const normalizedPassword = password.slice(0, span.i)
    + parse.localText
    + password.slice(span.j + 1);
  const normalized = baseScore(normalizedPassword);

  // A local splice does not reproduce zxcvbn's global arrangement cost.
  // If removing one edge separator reveals a completely parsed password,
  // keep that whole-password cost and explicitly charge the separator.
  if (normalized.sequence.some((piece) => piece.pattern === 'bruteforce')) return null;

  return normalized.guessesLog10 + parse.separatorLog10;
}

function scoreRecoveredLocalDictionaryParse(password, baseline, baseScore) {
  const candidates = [];
  const bruteForceSpans = baseline.sequence
    .filter((piece) => piece.pattern === 'bruteforce')
    .filter((piece) => piece.token.length >= MIN_SPAN_LENGTH)
    .filter((piece) => !(piece.i === 0 && piece.j === password.length - 1))
    .slice(0, MAX_SPANS_TO_INSPECT);

  for (const span of bruteForceSpans) {
    const text = password.slice(span.i, span.j + 1);

    for (const parse of localParseCandidates(text)) {
      const local = baseScore(parse.localText);
      const dictionaryPieces = selectedDictionaryPieces(local);
      const { dictionaryCoverage, meaningfulPieces } = dictionaryEvidence(dictionaryPieces, parse.localText.length);
      const adjustedLocalLog10 = local.guessesLog10 + parse.separatorLog10;
      const savings = span.guessesLog10 - adjustedLocalLog10;

      if (dictionaryCoverage < MIN_DICTIONARY_COVERAGE) continue;
      if (!meaningfulPieces) continue;
      if (savings < MIN_LOG10_SAVINGS) continue;

      const splicedCandidateLog10 = baseline.guessesLog10
        - span.guessesLog10
        + adjustedLocalLog10
        + LOCAL_PARSE_LAYOUT_LOG10;
      const normalizedFloorLog10 = normalizedWholePasswordFloor(password, span, parse, baseScore);
      const candidateLog10 = normalizedFloorLog10 === null
        ? splicedCandidateLog10
        : Math.max(splicedCandidateLog10, normalizedFloorLog10);

      if (!(candidateLog10 + 1e-9 < baseline.guessesLog10)) continue;

      candidates.push({
        candidateLog10,
        spanStart: span.i,
        spanEnd: span.j + 1,
        text,
        baselineSpanLog10: span.guessesLog10,
        localSpanLog10: local.guessesLog10,
        dictionaryCoverage,
        dictionaryPieces
      });
    }
  }

  const best = candidates.reduce(
    (current, candidate) => (!current || candidate.candidateLog10 < current.candidateLog10 ? candidate : current),
    null
  );

  return {
    effectiveLog10: best ? best.candidateLog10 : baseline.guessesLog10,
    changed: Boolean(best),
    composition: best
  };
}

module.exports = { scoreRecoveredLocalDictionaryParse };
