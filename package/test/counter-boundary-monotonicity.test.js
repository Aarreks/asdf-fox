'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { zxcvbn } = require('../src/zxcvbn');
const { analyzePassword } = require('../src/analyse');
const { detectStructure, applyStructuralCaps } = require('../src/heuristics');

function score(text) {
  return zxcvbn(text, []);
}

function counterDetection(password) {
  return detectStructure(password, score).find(
    (detection) => detection.id === 'numbered-repeated-token-sequence'
  );
}

function effective(password) {
  const baseline = score(password).guessesLog10;
  return applyStructuralCaps(baseline, detectStructure(password, score), score).effectiveLog10;
}

test('recognizes all token-counter boundary layouts as one complete arithmetic construction', () => {
  const cases = [
    ['gay68gay69gay70', 3],
    ['gay68gay69gay70gay', 3],
    ['68gay69gay70', 3],
    ['68gay69gay70gay', 3],
    ['68gay69gay70gay71', 4],
    ['16c17c18c19', 4]
  ];

  for (const [password, terms] of cases) {
    const detection = counterDetection(password);
    assert.ok(detection, password);
    assert.equal(detection.start, password.startsWith('16c') ? 16 : 68, password);
    assert.equal(detection.step, 1, password);
    assert.equal(detection.terms, terms, password);
    assert.deepEqual([detection.spanStart, detection.spanEnd], [0, password.length], password);
  }
});

test('a completed number-first counter remains recognized as its next arithmetic value is appended', () => {
  const closed = '68gay69gay70gay';
  const extended = '68gay69gay70gay71';
  const closedEffective = effective(closed);
  const extendedEffective = effective(extended);

  assert.ok(closedEffective < score(closed).guessesLog10, `${closedEffective} did not lower ${closed}`);
  assert.ok(extendedEffective < score(extended).guessesLog10, `${extendedEffective} did not lower ${extended}`);
  assert.ok(
    extendedEffective >= closedEffective - 1e-9,
    `${extendedEffective} unexpectedly fell below ${closedEffective}`
  );
  assert.ok(
    extendedEffective - closedEffective < 0.2,
    `${extendedEffective} unexpectedly far above ${closedEffective}`
  );
});

test('charges a visible four-way counter-boundary layout cost', () => {
  const result = analyzePassword('68gay69gay70gay', { userInputs: [] });
  const detection = result.structuralDetections.find(
    (item) => item.id === 'numbered-repeated-token-sequence'
  );

  assert.ok(detection);
  assert.ok(detection.counterEdgeLayoutLog10 > 0.5);
  assert.ok(detection.counterEdgeLayoutLog10 < 0.7);
  assert.equal(detection.selectedInComposite, true);
});

test('does not turn a malformed adjacent number-first template into a partial arithmetic counter', () => {
  for (const password of [
    '68gay69guy70gay',
    '68gay69gay71gay',
    '16c17c18',
    '16c17c19c20'
  ]) {
    assert.equal(counterDetection(password), undefined, password);
  }
});
