'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { metadata, scoreCommonBigramPatterns, segmentAlphabeticRun } = require('../src/commonBigrams');
const { analyzePassword } = require('../src/analyse');

test('ships the requested 100,000-entry cleaned bigram table', () => {
  const details = metadata();
  assert.equal(details.entryCount, 100_000);
  assert.match(details.selection, /Top 100000 lowercase ASCII alphabetic/i);
  assert.match(details.jointParsePolicy, /one non-bruteforce match/i);
});

test('does not stack a bigram adjustment on a zxcvbn joint parse', () => {
  const joined = scoreCommonBigramPatterns('newyork', 10);
  const separated = scoreCommonBigramPatterns('new_york', 10);

  assert.equal(joined.changed, false);
  assert.equal(joined.composition, null);
  assert.equal(separated.changed, true);
  const pair = separated.composition.patterns[0].selectedPairs[0];
  assert.equal(`${pair.left} ${pair.right}`, 'new york');
  assert.ok(pair.reductionLog10 > 0);
  assert.ok(pair.pairFloorLog10 >= Math.max(Math.log10(pair.leftRank), Math.log10(pair.rightRank)));
});

test('charges an explicit one-character separator and refuses two separators as one boundary', () => {
  const separated = scoreCommonBigramPatterns('new_york', 10);
  const doubleSeparated = scoreCommonBigramPatterns('new__york', 10);

  assert.equal(separated.changed, true);
  assert.equal(doubleSeparated.changed, false);
});

test('preserves a common whole word rather than splitting cannot into can plus not', () => {
  const segmented = segmentAlphabeticRun('ilikebigcatsandicannotlie');
  assert.ok(segmented);
  assert.deepEqual(segmented.words.map((word) => word.word), [
    'i', 'like', 'big', 'cats', 'and', 'i', 'cannot', 'lie'
  ]);
});

test('does not discount a middle word twice when two hits share it', () => {
  const scored = scoreCommonBigramPatterns('can-not-lie', 10);
  assert.equal(scored.changed, true);
  const [pattern] = scored.composition.patterns;
  assert.ok(pattern.hits.length >= 2);
  assert.equal(pattern.selectedPairs.length, 1);
});

test('publishes inspectable common-bigram evidence through the public local API', () => {
  const result = analyzePassword('new_york', { userInputs: [] });
  assert.equal(result.score.changedByCommonBigrams, true);
  assert.ok(result.commonBigramPatterns);
  assert.equal(result.commonBigramPatterns.patterns[0].selectedPairs[0].left, 'new');
  assert.equal(result.commonBigramPatterns.patterns[0].selectedPairs[0].right, 'york');
  assert.ok(result.score.effectiveLog10 < result.score.baselineLog10);
});

test('keeps the explicit-separator adjustment but avoids a second penalty for a known compound', () => {
  const separated = analyzePassword('big-dick-69420', { userInputs: [] });
  const joined = analyzePassword('bigdick-69420', { userInputs: [] });

  assert.equal(separated.score.changedByCommonBigrams, true);
  assert.ok(separated.commonBigramPatterns);
  assert.equal(joined.score.changedByCommonBigrams, false);
  assert.equal(joined.commonBigramPatterns, null);
  assert.equal(joined.score.effectiveLog10, joined.score.baselineLog10);
});

test('still discounts a separatorless pair when zxcvbn keeps its two words separate', () => {
  const result = analyzePassword('goodgame-123', { userInputs: [] });
  assert.equal(result.score.changedByCommonBigrams, true);
  assert.ok(result.commonBigramPatterns);
  const pair = result.commonBigramPatterns.patterns[0].selectedPairs[0];
  assert.equal(`${pair.left} ${pair.right}`, 'good game');
});

test('recovers a common pair through literal alphabetic edge residue without deleting it', () => {
  for (const password of ['xnew_york', 'new_yorkx', 'xnew_yorkx', 'xxnew_york', 'new_yorkxx']) {
    const scored = scoreCommonBigramPatterns(password, 10);
    assert.equal(scored.changed, true, password);
    const [pattern] = scored.composition.patterns;
    assert.equal(pattern.selectedPairs[0].left, 'new', password);
    assert.equal(pattern.selectedPairs[0].right, 'york', password);
    assert.ok(pattern.uncoveredCharacters >= 1, password);
  }
});

test('does not bridge an uncovered internal letter as though it were a separator', () => {
  assert.equal(scoreCommonBigramPatterns('newxyork', 10).changed, false);
  assert.equal(scoreCommonBigramPatterns('happyb_irthday', 10).changed, false);
});

test('retains exact explicit-separator behavior when either run has edge residue', () => {
  const prefixed = scoreCommonBigramPatterns('xnew_york', 10);
  const suffixed = scoreCommonBigramPatterns('new_yorkx', 10);
  assert.equal(prefixed.changed, true);
  assert.equal(suffixed.changed, true);
  assert.equal(prefixed.composition.patterns[0].selectedPairs[0].separator, '_');
  assert.equal(suffixed.composition.patterns[0].selectedPairs[0].separator, '_');
});
