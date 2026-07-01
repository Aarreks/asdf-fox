'use strict';

const { ZxcvbnFactory } = require('@zxcvbn-ts/core');
const { dictionary: commonDictionary, adjacencyGraphs } = require('@zxcvbn-ts/language-common');
const { dictionary: enDictionary, translations: enTranslations } = require('@zxcvbn-ts/language-en');

const engine = new ZxcvbnFactory({
  dictionary: {
    ...commonDictionary,
    ...enDictionary
  },
  graphs: adjacencyGraphs,
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
