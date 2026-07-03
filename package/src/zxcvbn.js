'use strict';

const { ZxcvbnFactory } = require('@zxcvbn-ts/core');
const { dictionary: commonDictionary, adjacencyGraphs } = require('@zxcvbn-ts/language-common');
const { dictionary: enDictionary, translations: enTranslations } = require('@zxcvbn-ts/language-en');

// language-common is CommonJS here and exposes its adjacency map under
// `default`. ZxcvbnFactory expects the map itself, keyed by qwerty/azerty/etc.
// Keep the direct form for module builds that already export that inner map.
const graphs = adjacencyGraphs?.default?.qwerty ? adjacencyGraphs.default : adjacencyGraphs;

const engine = new ZxcvbnFactory({
  dictionary: {
    ...commonDictionary,
    ...enDictionary
  },
  graphs,
  translations: enTranslations
});

function zxcvbn(password, userInputs) {
  return engine.check(password, userInputs);
}

function parseContext(context) {
  return context
    .split(/[\s,;|]+/u)
    .map((value) => value.trim())
    .filter((value) => value.length >= 2)
    .slice(0, 30);
}

module.exports = { zxcvbn, parseContext };
