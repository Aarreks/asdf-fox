'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { zxcvbn } = require('../src/zxcvbn');
const { scoreRecoveredLocalDictionaryParse } = require('../src/localDictionaryRecovery');
const { analyzePassword } = require('../src/analyse');

test('recovers a local dictionary parse from a generic span selected by the full parse', () => {
  const password = 'ilikebigcats!';
  const baseline = zxcvbn(password, []);
  const recovered = scoreRecoveredLocalDictionaryParse(password, baseline, (value) => zxcvbn(value, []));

  assert.equal(recovered.changed, true);
  assert.equal(recovered.composition.text, 'bigcats!');
  assert.deepEqual([recovered.composition.spanStart, recovered.composition.spanEnd], [5, 13]);
  assert.ok(recovered.composition.dictionaryCoverage >= 0.6);
  assert.ok(recovered.composition.dictionaryPieces.some((piece) => piece.matchedWord === 'bigcat'));
  assert.ok(recovered.effectiveLog10 < 10);
  assert.ok(recovered.effectiveLog10 < baseline.guessesLog10);
});

test('does not treat a whole-password local parse as a recoverable interior span', () => {
  const password = 'bigcats!';
  const baseline = zxcvbn(password, []);
  const recovered = scoreRecoveredLocalDictionaryParse(password, baseline, (value) => zxcvbn(value, []));

  assert.equal(recovered.changed, false);
  assert.equal(recovered.composition, null);
  assert.equal(recovered.effectiveLog10, baseline.guessesLog10);
});

test('publishes a selected local dictionary recovery without claiming phrase inference', () => {
  const result = analyzePassword('ilikebigcats!', { userInputs: [] });

  assert.equal(result.score.changedByLocalDictionaryRecovery, true);
  assert.ok(result.localDictionaryRecovery);
  assert.equal(result.localDictionaryRecovery.text, 'bigcats!');
  assert.ok(result.localDictionaryRecovery.dictionaryPieces.some((piece) => piece.matchedWord === 'bigcat'));
  assert.equal(result.score.grade.letter, 'B');
});

test('recovers an edge-separated local dictionary parse', () => {
  const password = 'ilikebigmeow!';
  const baseline = zxcvbn(password, []);
  const recovered = scoreRecoveredLocalDictionaryParse(password, baseline, (value) => zxcvbn(value, []));

  assert.equal(recovered.changed, true);
  assert.equal(recovered.composition.text, 'bigmeow!');
  assert.deepEqual(
    recovered.composition.dictionaryPieces.map((piece) => piece.matchedWord),
    ['big', 'meow']
  );
  assert.ok(recovered.effectiveLog10 < 10.5);
});

test('does not remove two terminal separators during local recovery', () => {
  const password = 'ilikebigmeow!!';
  const baseline = zxcvbn(password, []);
  const recovered = scoreRecoveredLocalDictionaryParse(password, baseline, (value) => zxcvbn(value, []));

  assert.equal(recovered.changed, false);
  assert.equal(recovered.composition, null);
});
