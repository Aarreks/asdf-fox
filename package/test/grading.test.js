'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { grade, band } = require('../src');

test('default grades use the raw effective log10 estimate at exact half-log boundaries', () => {
  const cases = [
    [4.499999, 'F', 'Extreme fail'],
    [4.5, 'D', 'Fail'],
    [6.499999, 'D', 'Fail'],
    [6.5, 'C', 'Critical warning'],
    [8.499999, 'C', 'Critical warning'],
    [8.5, 'B', 'Warning'],
    [10.499999, 'B', 'Warning'],
    [10.5, 'A', 'Acceptable']
  ];

  for (const [estimate, letter, label] of cases) {
    const result = grade(estimate);
    assert.equal(result.letter, letter, `unexpected grade for ${estimate}`);
    assert.equal(result.label, label, `unexpected label for ${estimate}`);
  }
});

test('an exact breach match overrides the presentation grade', () => {
  const result = grade(99, true);
  assert.deepEqual(result, {
    letter: 'F',
    label: 'Exposed password',
    level: 'grade-exposed',
    minimumLog10: null
  });
});

test('band remains a legacy alias for grade in 0.1.x', () => {
  assert.deepEqual(band(8.5), grade(8.5));
});
