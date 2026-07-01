'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { metadata, scoreCommonBigramPatterns, segmentAlphabeticRun } = require('../src/commonBigrams');
const { analyzePassword } = require('../src/analyse');

test('ships the requested 100,000-entry cleaned bigram table', () => {
  const details = metadata();
  assert.equal(details.entryCount, 100_000);
  assert.match(details.selection, /Top 100000 lowercase ASCII alphabetic/i);
});

test('recovers a merged exact pair and keeps the pair above the harder-word floor', () => {
  const scored = scoreCommonBigramPatterns('newyork', 10);

  assert.equal(scored.changed, true);
  assert.equal(scored.composition.patterns.length, 1);
  const pair = scored.composition.patterns[0].selectedPairs[0];
  assert.equal(`${pair.left} ${pair.right}`, 'new york');
  assert.ok(pair.reductionLog10 > 0);
  assert.ok(pair.pairFloorLog10 >= Math.max(Math.log10(pair.leftRank), Math.log10(pair.rightRank)));
  assert.ok(scored.effectiveLog10 < 10);
});

test('charges an explicit one-character separator and refuses two separators as one boundary', () => {
  const merged = scoreCommonBigramPatterns('newyork', 10);
  const separated = scoreCommonBigramPatterns('new_york', 10);
  const doubleSeparated = scoreCommonBigramPatterns('new__york', 10);

  assert.equal(separated.changed, true);
  assert.ok(separated.composition.totalReductionLog10 < merged.composition.totalReductionLog10);
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


test('recovers a common pair through literal alphabetic edge residue without deleting it', () => {
  for (const password of ['xnewyork', 'newyorkx', 'xnewyorkx', 'xxnewyork', 'newyorkxx']) {
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
