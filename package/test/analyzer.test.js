'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { detectStructure, applyStructuralCaps } = require('../src/heuristics');
const { buildVariantCandidates } = require('../src/variants');

function numericRunScore(segment) {
  const fixed = {
    flareon: 5.9785000693,
    '': 0,
    homosex: 6.8415721851,
    gay: 2.8893017025,
    poreon: 6.0000004343,
    va: 2.0043213738,
    2: 1.079181246
  };
  return { guessesLog10: fixed[segment] ?? 20 };
}

function effective(password, baseline) {
  const detections = detectStructure(password);
  return applyStructuralCaps(baseline, detections, numericRunScore).effectiveLog10;
}

test('detects concatenated +1 numeric sequence', () => {
  const detections = detectStructure('12345678910111213141516171819202122232425');
  assert.ok(detections.some((detection) => detection.id === 'concatenated-numeric-sequence'));
});

test('detects concatenated step-3 numeric sequence', () => {
  const detections = detectStructure('100103106109112115118121124127130133136139');
  assert.ok(detections.some((detection) => detection.id === 'concatenated-numeric-sequence'));
});

test('detects the four-term numeric sequence from the regression report', () => {
  const detections = detectStructure('flareon136137138139');
  const numeric = detections.find((detection) => detection.id === 'concatenated-numeric-sequence');
  assert.ok(numeric);
  assert.equal(numeric.terms, 4);
  assert.equal(numeric.prefix, 'flareon');
  assert.equal(numeric.suffix, '');
});

test('numeric structural score preserves non-numeric prefix cost', () => {
  const value = effective('flareon136137138139140', 20.4316279825);
  // This would have been 6.1 in the broken global-cap implementation.
  assert.ok(value > 10);
  assert.ok(value > numericRunScore('flareon').guessesLog10);
});

test('extending an already-established numeric run does not cause a downward score cliff', () => {
  const fourTerms = effective('flareon136137138139', 17.4316295884);
  const fiveTerms = effective('flareon136137138139140', 20.4316279825);
  // Adding the next deterministic term may add only a small length-choice
  // cost; it must not erase the prefix and drop the estimate by orders of
  // magnitude.
  assert.ok(fiveTerms >= fourTerms - 0.01, `${fiveTerms} unexpectedly below ${fourTerms}`);
  assert.ok(fiveTerms - fourTerms < 0.25, `${fiveTerms} unexpectedly far above ${fourTerms}`);
});

test('keeps an established pure numeric sequence when unrelated digits follow', () => {
  const password = '9899100101102102';
  const detections = detectStructure(password);
  const numeric = detections.find((detection) => detection.id === 'concatenated-numeric-sequence');

  assert.ok(numeric);
  assert.equal(numeric.run, '9899100101102');
  assert.equal(numeric.start, 98);
  assert.equal(numeric.step, 1);
  assert.equal(numeric.terms, 5);
  assert.deepEqual([numeric.spanStart, numeric.spanEnd], [0, 13]);
  assert.equal(numeric.suffix, '102');

  const score = (segment) => ({ guessesLog10: ({ '102': 3 }[segment] ?? 20) });
  const capped = applyStructuralCaps(12, detections, score);
  assert.ok(capped.effectiveLog10 < 12, `${capped.effectiveLog10} did not retain the established numeric prefix`);
  assert.ok(capped.composition?.pieces.some((piece) =>
    piece.type === 'literal' && piece.start === 13 && piece.end === password.length
  ));
});

test('detects a repeated token with an arithmetic counter', () => {
  const password = 'gay1gay2gay3gay4';
  const detections = detectStructure(password);
  const numbered = detections.find((detection) => detection.id === 'numbered-repeated-token-sequence');

  assert.ok(numbered);
  assert.equal(numbered.root, 'gay');
  assert.equal(numbered.start, 1);
  assert.equal(numbered.step, 1);
  assert.equal(numbered.terms, 4);
  assert.deepEqual([numbered.spanStart, numbered.spanEnd], [0, password.length]);

  const capped = applyStructuralCaps(16, detections, numericRunScore);
  assert.ok(capped.effectiveLog10 < 7, `${capped.effectiveLog10} did not replace repeated blocks with one counter template`);
  assert.ok(capped.effectiveLog10 > numericRunScore('gay').guessesLog10, `${capped.effectiveLog10} discarded counter construction cost`);
  assert.ok(capped.composition?.detectorIds.includes('numbered-repeated-token-sequence'));
});

test('finds numbered repeated-token templates inside surrounding literal text', () => {
  const password = 'Xcat7cat9cat11Y';
  const detections = detectStructure(password);
  const numbered = detections.find((detection) => detection.id === 'numbered-repeated-token-sequence');

  assert.ok(numbered);
  assert.equal(numbered.root, 'cat');
  assert.equal(numbered.start, 7);
  assert.equal(numbered.step, 2);
  assert.equal(numbered.terms, 3);
  assert.deepEqual([numbered.spanStart, numbered.spanEnd], [1, password.length - 1]);
});

test('does not infer a numbered repeated-token template from non-arithmetic or mismatched blocks', () => {
  for (const password of ['gay1gay2gay4', 'gay1guy2gay3', 'ga1ga2ga3']) {
    const detections = detectStructure(password);
    assert.ok(!detections.some((detection) => detection.id === 'numbered-repeated-token-sequence'), password);
  }
});

test('detects a repeated token with irregular numeric fields', () => {
  const password = '1and2and3and5and1';
  const detections = detectStructure(password);
  const template = detections.find((detection) => detection.id === 'repeated-token-numeric-template');

  assert.ok(template);
  assert.equal(template.root, 'and');
  assert.equal(template.terms, 4);
  assert.deepEqual(template.numberFields, ['2', '3', '5', '1']);
  assert.deepEqual([template.spanStart, template.spanEnd], [1, password.length]);
  assert.ok(!detections.some((detection) => detection.id === 'numbered-repeated-token-sequence'));

  const score = (segment) => ({
    guessesLog10: ({ and: 1.1, '1': 1, '2': 1, '3': 1, '5': 1 }[segment] ?? 20)
  });
  const capped = applyStructuralCaps(15, detections, score);
  assert.ok(capped.effectiveLog10 < 15, `${capped.effectiveLog10} did not remove repeated-token entropy`);
  assert.ok(capped.effectiveLog10 > 6, `${capped.effectiveLog10} treated irregular numbers like one arithmetic counter`);
  assert.ok(capped.composition?.detectorIds.includes('repeated-token-numeric-template'));
});

test('prefers the arithmetic-counter model when the same repeated-token template is arithmetic', () => {
  const password = 'and2and3and4and5';
  const detections = detectStructure(password);
  const arithmetic = detections.find((detection) => detection.id === 'numbered-repeated-token-sequence');
  const template = detections.find((detection) => detection.id === 'repeated-token-numeric-template');

  assert.ok(arithmetic);
  assert.ok(template);

  const score = (segment) => ({
    guessesLog10: ({ and: 1.1, '2': 1, '3': 1, '4': 1, '5': 1 }[segment] ?? 20)
  });
  const capped = applyStructuralCaps(15, detections, score);
  assert.ok(capped.effectiveLog10 < 6, `${capped.effectiveLog10} did not select the compact arithmetic model`);
  assert.ok(arithmetic.selectedInComposite);
  assert.equal(template.selectedInComposite, false);
});

test('does not infer a generic repeated-token numeric template from too few or mismatched blocks', () => {
  for (const password of ['and2and3', 'and2ant3and5', 'an2an3an5']) {
    const detections = detectStructure(password);
    assert.ok(!detections.some((detection) => detection.id === 'repeated-token-numeric-template'), password);
  }
});

test('keeps an established numbered run when a matching token resumes with an unrelated final number', () => {
  const password = '1and2and3and4and1';
  const detections = detectStructure(password);
  const numbered = detections.find((detection) => detection.id === 'numbered-repeated-token-sequence');

  assert.ok(numbered);
  assert.equal(numbered.root, 'and');
  assert.equal(numbered.start, 2);
  assert.equal(numbered.step, 1);
  assert.equal(numbered.terms, 3);
  assert.deepEqual([numbered.spanStart, numbered.spanEnd], [1, 13]);

  const score = (segment) => ({
    guessesLog10: ({ and: 1.1, '1': 0.3, and1: 1.4 }[segment] ?? 20)
  });
  const capped = applyStructuralCaps(14.15, detections, score);
  assert.ok(capped.effectiveLog10 < 14.15, `${capped.effectiveLog10} did not retain the local arithmetic run`);
  assert.ok(capped.composition?.pieces.some((piece) => piece.type === 'literal' && piece.start === 0 && piece.end === 1));
  assert.ok(capped.composition?.pieces.some((piece) => piece.type === 'literal' && piece.start === 13 && piece.end === password.length));
});

test('detects numbered repeated-token templates across case changes', () => {
  const detections = detectStructure('Gay1gAY2GAY3');
  const numbered = detections.find((detection) => detection.id === 'numbered-repeated-token-sequence');
  assert.ok(numbered);
  assert.equal(numbered.terms, 3);
  assert.equal(numbered.step, 1);
});

test('detects truncated periodic root', () => {
  const detections = detectStructure('vaporeonvaporeo');
  assert.ok(detections.some((detection) => detection.id === 'periodic-or-truncated-repeat'));
});

test('detects a repeated prefix/suffix around a short inserted word', () => {
  const password = 'homosexgayhomosex';
  const detections = detectStructure(password);
  const repeated = detections.find((detection) => detection.id === 'repeated-prefix-suffix');
  assert.ok(repeated);
  assert.equal(repeated.root, 'homosex');
  assert.equal(repeated.bridge, 'gay');

  const capped = applyStructuralCaps(16.84, detections, numericRunScore);
  assert.ok(capped.effectiveLog10 < 16.84);
  assert.ok(capped.effectiveLog10 <= 11);
});

test('detects a reused internal chunk after a short prefix and bridge', () => {
  const password = 'gayporeonvaporeon';
  const detections = detectStructure(password);
  const repeated = detections.find((detection) => detection.id === 'embedded-repeated-chunk');
  assert.ok(repeated);
  assert.equal(repeated.prefix, 'gay');
  assert.equal(repeated.root, 'poreon');
  assert.equal(repeated.bridge, 'va');

  const capped = applyStructuralCaps(16.6536755153, detections, numericRunScore);
  assert.ok(capped.effectiveLog10 < 16.6536755153);
  assert.ok(capped.effectiveLog10 > 12);
  assert.ok(capped.effectiveLog10 < 13);
});



test('composes an internal repeat with an independent arithmetic suffix', () => {
  const password = 'vaporeongayporeon13141516';
  const detections = detectStructure(password);
  const repeated = detections.find((detection) => detection.id === 'embedded-repeated-chunk');
  const numeric = detections.find((detection) => detection.id === 'concatenated-numeric-sequence');
  assert.ok(repeated, 'internal repeated chunk should be detected before trailing material');
  assert.ok(numeric, 'arithmetic suffix should be detected');

  const combined = applyStructuralCaps(22.78, detections, numericRunScore);
  assert.ok(combined.composition, 'a structural composition should be selected');
  assert.deepEqual(
    new Set(combined.composition.detectorIds),
    new Set(['embedded-repeated-chunk', 'concatenated-numeric-sequence'])
  );
  assert.ok(combined.effectiveLog10 < 20, `${combined.effectiveLog10} only reflected one finding`);
  assert.ok(combined.effectiveLog10 > 15, `${combined.effectiveLog10} discarded independent component cost`);
});

test('does not treat a short accidental overlap as a reused internal chunk', () => {
  const detections = detectStructure('startercart');
  assert.ok(!detections.some((detection) => detection.id === 'embedded-repeated-chunk'));
});

test('checks a breached base formed by deleting exactly one final character', () => {
  const candidates = buildVariantCandidates('correcthorsebatteryX');
  assert.ok(candidates.some((candidate) =>
    candidate.value === 'correcthorsebattery' && candidate.label === 'removed one final character'));
});

test('checks a short breached base formed by deleting one final character', () => {
  const candidates = buildVariantCandidates('algodoo7');
  assert.ok(candidates.some((candidate) =>
    candidate.value === 'algodoo' && candidate.label === 'removed one final character'));
});

test('does not strip arbitrary six-digit tails', () => {
  const candidates = buildVariantCandidates('correcthorsebattery549271');
  assert.ok(!candidates.some((candidate) => candidate.value === 'correcthorsebattery'));
});

test('does strip a short numeric tail', () => {
  const candidates = buildVariantCandidates('correcthorsebattery123');
  assert.ok(candidates.some((candidate) => candidate.value === 'correcthorsebattery'));
});

test('parses a padded HIBP range response and ignores zero-count padding', () => {
  const { parseRangeResponse } = require('../src/pwned');
  const parsed = parseRangeResponse('AABB:7\r\nDEAD:0\r\nBEEF:19');
  assert.equal(parsed.get('AABB'), 7);
  assert.equal(parsed.get('BEEF'), 19);
  assert.equal(parsed.has('DEAD'), false);
});

test('composes a local truncated repeat with a trailing arithmetic sequence', () => {
  const password = 'flareonflareo13141516';
  const detections = detectStructure(password);
  const repeat = detections.find((detection) => detection.id === 'local-periodic-or-truncated-repeat');
  const numeric = detections.find((detection) => detection.id === 'concatenated-numeric-sequence');

  assert.ok(repeat, 'the local truncated repeat should survive unrelated trailing material');
  assert.equal(repeat.root, 'flareon');
  assert.equal(repeat.continuation, 'flareo');
  assert.deepEqual([repeat.spanStart, repeat.spanEnd], [0, 13]);
  assert.ok(numeric, 'the independent numeric suffix should still be detected');

  const combined = applyStructuralCaps(18.85, detections, numericRunScore);
  assert.ok(combined.composition, 'a composite parse should be selected');
  assert.deepEqual(
    new Set(combined.composition.detectorIds),
    new Set(['local-periodic-or-truncated-repeat', 'concatenated-numeric-sequence'])
  );
  assert.ok(combined.effectiveLog10 < 12, `${combined.effectiveLog10} did not charge both weaknesses`);
  assert.ok(combined.effectiveLog10 > 11, `${combined.effectiveLog10} discarded the root/sequence construction cost`);
});

test('does not infer a local truncated repeat from a near miss', () => {
  const detections = detectStructure('flareonflabc13141516');
  assert.ok(!detections.some((detection) => detection.id === 'local-periodic-or-truncated-repeat'));
});

test('keeps a local truncated repeat when a one-character suffix follows it', () => {
  const password = 'flareonflareo2';
  const detections = detectStructure(password);
  const repeat = detections.find((detection) => detection.id === 'local-periodic-or-truncated-repeat');

  assert.ok(repeat, 'the one-character suffix must not hide the repeated span');
  assert.equal(repeat.root, 'flareon');
  assert.equal(repeat.continuation, 'flareo');
  assert.deepEqual([repeat.spanStart, repeat.spanEnd], [0, 13]);

  const combined = applyStructuralCaps(13.07, detections, numericRunScore);
  assert.ok(combined.adjustments.length > 0, 'the local repeated span should lower the estimate');
  assert.ok(combined.effectiveLog10 < 9, `${combined.effectiveLog10} did not discount the repeated root`);
});

const { findModernLexiconMatches, scoreLexiconAware } = require('../src/modernLexicon');
const { zxcvbn: baseZxcvbn } = require('../src/zxcvbn');

test('recognizes modern proper nouns from the bundled ranked wordfreq overlay', () => {
  const matches = findModernLexiconMatches('undertale');
  const undertale = matches.find((match) => match.token === 'undertale');
  assert.ok(undertale, 'undertale should be present in the bundled wordfreq-derived overlay');
  assert.equal(undertale.confidence, 'frequency-ranked');
  assert.ok(undertale.rank > 10_000 && undertale.rank < 100_000);
});

test('uses a full modern proper noun as a lower-cost lexical parse than generic dictionary splitting', () => {
  const scored = scoreLexiconAware('flareon', (value) => baseZxcvbn(value, []));
  assert.equal(scored.changed, true);
  assert.deepEqual(scored.composition.matches.map((match) => match.token), ['flareon']);
  assert.ok(scored.effectiveLog10 < scored.baseline.guessesLog10);
});

test('recognizes a coverage-only post-2021 entity without claiming a measured frequency rank', () => {
  const scored = scoreLexiconAware('chatgpt123', (value) => baseZxcvbn(value, []));
  const chatgpt = scored.matches.find((match) => match.token === 'chatgpt');
  assert.ok(chatgpt);
  assert.equal(chatgpt.confidence, 'coverage-only');
  assert.equal(scored.changed, true);
  assert.deepEqual(scored.composition.matches.map((match) => match.token), ['chatgpt']);
});

test('does not add an arbitrary long-gap lexical parse on top of compound structural cases', () => {
  const scored = scoreLexiconAware('flareonflareo13141516', (value) => baseZxcvbn(value, []));
  assert.equal(scored.changed, false);
});

test('adds a small visible bonus for irregular capitalization of a recognized modern token', () => {
  const plain = scoreLexiconAware('flareon', (value) => baseZxcvbn(value, []));
  const irregular = scoreLexiconAware('flAreon', (value) => baseZxcvbn(value, []));
  const match = irregular.matches.find((candidate) => candidate.token === 'flareon');

  assert.ok(match, 'the case-folded token should still be recognized');
  assert.equal(match.caseKind, 'irregular capitalization');
  assert.ok(match.caseLog10Bonus > 0);
  assert.ok(match.caseLog10Bonus <= 0.55);
  assert.ok(irregular.effectiveLog10 > plain.effectiveLog10);
  assert.ok(irregular.effectiveLog10 - plain.effectiveLog10 <= 0.56);
});

test('recognizes standard leet spelling but credits it only modestly', () => {
  const plain = scoreLexiconAware('flareon', (value) => baseZxcvbn(value, []));
  const leet = scoreLexiconAware('fl4r30n', (value) => baseZxcvbn(value, []));
  const match = leet.matches.find((candidate) => candidate.token === 'flareon');

  assert.ok(match, 'the leet-normalized token should be recognized');
  assert.equal(match.matchMode, 'leet-normalized');
  assert.equal(match.leetSubstitutionCount, 3);
  assert.ok(match.leetLog10Bonus > 0);
  assert.ok(match.leetLog10Bonus <= 0.55);
  assert.equal(leet.changed, true);
  assert.ok(leet.effectiveLog10 > plain.effectiveLog10);
  assert.ok(leet.effectiveLog10 - plain.effectiveLog10 < 0.7);
});

test('bounded lexical edge spans preserve monotonic cost for a short numeric prefix', () => {
  const one = scoreLexiconAware('1flareonvaporeon', (value) => baseZxcvbn(value, []));
  const thirteen = scoreLexiconAware('13flareonvaporeon', (value) => baseZxcvbn(value, []));

  assert.equal(one.changed, true);
  assert.equal(thirteen.changed, true);
  assert.ok(thirteen.effectiveLog10 > one.effectiveLog10, `${thirteen.effectiveLog10} should exceed ${one.effectiveLog10}`);
  assert.ok(thirteen.composition.literalSegments.some((segment) => segment.side === 'prefix' && segment.text === '13'));
});

test('recognizes a modern token between bounded short edge spans', () => {
  const scored = scoreLexiconAware('homoflAreon62', (value) => baseZxcvbn(value, []));
  const match = scored.matches.find((candidate) => candidate.token === 'flareon');

  assert.ok(match);
  assert.equal(match.caseKind, 'irregular capitalization');
  assert.equal(scored.changed, true);
  assert.deepEqual(scored.composition.literalSegments.map((segment) => segment.text), ['homo', '62']);
});
