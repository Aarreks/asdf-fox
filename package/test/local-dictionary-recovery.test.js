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

test('retains full-password arrangement cost when an edge separator exposes a complete parse', () => {
  const password = 'youwantapples?';
  const baseline = zxcvbn(password, []);
  const normalized = zxcvbn('youwantapples', []);
  const recovered = scoreRecoveredLocalDictionaryParse(password, baseline, (value) => zxcvbn(value, []));

  assert.equal(recovered.changed, true);
  assert.ok(recovered.composition);
  assert.ok(
    recovered.composition.candidateLog10 >= normalized.guessesLog10 + 0.15 - 1e-9,
    'the recovery retains the normalized whole-password parse plus the stripped separator cost'
  );
  assert.ok(recovered.effectiveLog10 < baseline.guessesLog10);
});

test('does not score the punctuated form below the normalized form after the full pipeline', () => {
  const plain = analyzePassword('youwantapples', { userInputs: [] });
  const punctuated = analyzePassword('youwantapples?', { userInputs: [] });

  assert.equal(punctuated.score.changedByLocalDictionaryRecovery, true);
  assert.ok(
    punctuated.score.effectiveLog10 > plain.score.effectiveLog10,
    'adding ? retains a positive explicit cost after the same pair adjustment'
  );
});
