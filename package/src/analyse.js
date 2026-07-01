'use strict';

const { zxcvbn, parseContext } = require('./zxcvbn');
const { metadata: modernLexiconMetadata, scoreLexiconAware } = require('./modernLexicon');
const { scoreRecoveredLocalDictionaryParse } = require('./localDictionaryRecovery');
const { detectStructure, applyStructuralCaps } = require('./heuristics');
const { buildVariantCandidates } = require('./variants');
const { checkPwned } = require('./pwned');

function now() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function round(value) {
  return Number(value.toFixed(2));
}

function grade(log10Guesses, exactPwned = false) {
  if (!Number.isFinite(log10Guesses)) throw new TypeError('log10Guesses must be finite.');

  if (exactPwned) {
    return { letter: 'F', label: 'Exposed password', level: 'grade-exposed', minimumLog10: null };
  }
  if (log10Guesses >= 10.5) {
    return { letter: 'A', label: 'Acceptable', level: 'grade-a', minimumLog10: 10.5 };
  }
  if (log10Guesses >= 8.5) {
    return { letter: 'B', label: 'Warning', level: 'grade-b', minimumLog10: 8.5 };
  }
  if (log10Guesses >= 6.5) {
    return { letter: 'C', label: 'Critical warning', level: 'grade-c', minimumLog10: 6.5 };
  }
  if (log10Guesses >= 4.5) {
    return { letter: 'D', label: 'Fail', level: 'grade-d', minimumLog10: 4.5 };
  }
  return { letter: 'F', label: 'Extreme fail', level: 'grade-f', minimumLog10: null };
}

// Kept as a legacy alias for 0.1.x consumers. New integrations should use grade().
function band(log10Guesses, exactPwned = false) {
  return grade(log10Guesses, exactPwned);
}

function validate(password, options) {
  if (typeof password !== 'string') throw new TypeError('password must be a string.');
  if (password.length === 0) throw new RangeError('password must not be empty.');
  if (password.length > (options.maxPasswordLength || 256)) throw new RangeError('password exceeds the configured maximum length.');
}

function resolveInputs(options) {
  if (Array.isArray(options.userInputs)) return options.userInputs.filter((value) => typeof value === 'string').slice(0, 30);
  return parseContext(typeof options.context === 'string' ? options.context : '');
}

function createBaseResult(password, options = {}) {
  validate(password, options);
  const totalStarted = now();
  const timings = [];
  const userInputs = resolveInputs(options);
  const baseScoreCache = new Map();
  const baseScore = (text) => {
    if (!baseScoreCache.has(text)) baseScoreCache.set(text, zxcvbn(text, userInputs));
    return baseScoreCache.get(text);
  };

  const baselineStarted = now();
  const baseline = baseScore(password);
  timings.push({ label: 'zxcvbn-ts baseline', ms: round(now() - baselineStarted) });

  const lexicalStarted = now();
  const lexical = scoreLexiconAware(password, baseScore);
  timings.push({ label: 'modern vocabulary overlay', ms: round(now() - lexicalStarted) });

  const selectedBaselineDictionarySpans = new Set(
    baseline.sequence
      .filter((match) => match.pattern === 'dictionary')
      .map((match) => `${match.i}:${match.j + 1}:${String(match.matchedWord).toLocaleLowerCase('en-US')}`)
  );
  const selectedLexicalSpans = new Set((lexical.composition?.matches || []).map((match) => `${match.start}:${match.end}:${match.token}`));

  const recoveryStarted = now();
  const localDictionaryRecovery = scoreRecoveredLocalDictionaryParse(password, baseline, baseScore);
  timings.push({ label: 'local dictionary recovery', ms: round(now() - recoveryStarted) });

  const preStructuralLog10 = Math.min(lexical.effectiveLog10, localDictionaryRecovery.effectiveLog10);

  const structuralStarted = now();
  const detections = detectStructure(password);
  const structural = applyStructuralCaps(preStructuralLog10, detections, (root) => {
    const rootResult = scoreLexiconAware(root, baseScore);
    return { guessesLog10: rootResult.effectiveLog10 };
  });
  timings.push({ label: 'deterministic structure detectors', ms: round(now() - structuralStarted) });

  const variantsStarted = now();
  const candidates = buildVariantCandidates(password);
  timings.push({ label: 'limited variant construction', ms: round(now() - variantsStarted) });

  const currentLog10 = structural.effectiveLog10;
  const scoreGrade = grade(currentLog10, false);
  return {
    _internal: { candidates, totalStarted, effectiveLog10Raw: currentLog10 },
    score: {
      baselineLog10: round(baseline.guessesLog10),
      lexiconLog10: round(lexical.effectiveLog10),
      effectiveLog10: round(currentLog10),
      baselineZxcvbnScore: baseline.score,
      grade: scoreGrade,
      // Deprecated legacy alias. It returns the same grade object in 0.1.x.
      band: scoreGrade,
      changedByLexicon: lexical.changed,
      changedByLocalDictionaryRecovery: localDictionaryRecovery.changed,
      changedByStructure: structural.adjustments.length > 0
    },
    contextTokensUsed: userInputs.length,
    modernLexicon: {
      ...modernLexiconMetadata(),
      candidateLog10: lexical.composition ? round(lexical.composition.candidateLog10) : null,
      matches: lexical.matches.map((match) => ({
        ...match,
        selectedByBaseline: selectedBaselineDictionarySpans.has(`${match.start}:${match.end}:${match.token}`),
        selectedByLexicon: selectedLexicalSpans.has(`${match.start}:${match.end}:${match.token}`)
      }))
    },
    localDictionaryRecovery: localDictionaryRecovery.composition ? {
      candidateLog10: round(localDictionaryRecovery.composition.candidateLog10),
      spanStart: localDictionaryRecovery.composition.spanStart,
      spanEnd: localDictionaryRecovery.composition.spanEnd,
      text: localDictionaryRecovery.composition.text,
      baselineSpanLog10: round(localDictionaryRecovery.composition.baselineSpanLog10),
      localSpanLog10: round(localDictionaryRecovery.composition.localSpanLog10),
      dictionaryCoverage: round(localDictionaryRecovery.composition.dictionaryCoverage),
      dictionaryPieces: localDictionaryRecovery.composition.dictionaryPieces
    } : null,
    exactPwned: null,
    closeVariantWarnings: [],
    pwnedChecks: [],
    breachStatus: 'not-checked',
    structuralDetections: detections.map((detection) => ({
      id: detection.id,
      severity: detection.severity,
      title: detection.title,
      detail: detection.detail,
      rootBaselineLog10: detection.rootBaselineLog10 === undefined ? null : round(detection.rootBaselineLog10),
      bridgeBaselineLog10: detection.bridgeBaselineLog10 === undefined ? null : round(detection.bridgeBaselineLog10),
      prefixBaselineLog10: detection.prefixBaselineLog10 === undefined ? null : round(detection.prefixBaselineLog10),
      suffixBaselineLog10: detection.suffixBaselineLog10 === undefined ? null : round(detection.suffixBaselineLog10),
      sequenceModelLog10: detection.sequenceModelLog10 === undefined ? null : round(detection.sequenceModelLog10),
      structuralCandidateLog10: detection.structuralCandidateLog10 === undefined ? null : round(detection.structuralCandidateLog10),
      selectedInComposite: Boolean(detection.selectedInComposite),
      spanStart: Number.isInteger(detection.spanStart) ? detection.spanStart : null,
      spanEnd: Number.isInteger(detection.spanEnd) ? detection.spanEnd : null
    })),
    structuralComposition: structural.composition ? {
      detectorIds: structural.composition.detectorIds,
      detectorTitles: structural.composition.detectorTitles,
      candidateLog10: round(structural.composition.candidateLog10),
      pieceCount: structural.composition.pieces.length
    } : null,
    zxcvbnFeedback: baseline.feedback,
    unavailable: false,
    timings,
    totalRuntimeMs: round(now() - totalStarted),
    methodology: {
      exactPwnedMeaning: 'Exact means the entire password hash matched the Pwned Passwords corpus.',
      variantMeaning: 'A close-variant hit is a bounded attacker-cost warning, not proof that the entered password itself was exposed.',
      modernLexicon: 'The local vocabulary overlay is not a breach result. It proposes an alternative parse using ranked contemporary tokens plus ordinary zxcvbn scoring for every literal gap. Frequency-ranked entries come from a wordfreq English snapshot through about 2021; newer seed entries receive deliberately conservative fallback ranks.',
      localDictionaryRecovery: 'A bounded local recovery pass rechecks up to three generic spans selected by zxcvbn. It applies only when a local zxcvbn parse finds dictionary coverage over most of that span and materially lowers its estimate. It does not score phrases or infer semantic associations.',
      privacy: 'Only the first five characters of each candidate SHA-1 hash are sent to HIBP. The app never sends the plaintext password to HIBP and does not log or persist it.'
    }
  };
}

function finish(result, pwned) {
  const exact = pwned.checks.find((check) => check.kind === 'exact');
  const closeVariants = pwned.checks.filter((check) => check.kind !== 'exact' && check.breached);
  const unavailable = pwned.checks.some((check) => check.state === 'unavailable');
  const scoreGrade = grade(result._internal.effectiveLog10Raw, Boolean(exact?.breached));
  result.score.grade = scoreGrade;
  // Deprecated legacy alias. It returns the same grade object in 0.1.x.
  result.score.band = scoreGrade;
  result.exactPwned = exact ? {
    state: exact.state,
    breached: exact.breached,
    count: exact.count,
    runtimeMs: round(exact.runtimeMs),
    source: exact.source || null,
    reason: exact.reason || null
  } : null;
  result.closeVariantWarnings = closeVariants.map((check) => ({ label: check.label, count: check.count, runtimeMs: round(check.runtimeMs) }));
  result.pwnedChecks = pwned.checks.map((check) => ({
    kind: check.kind,
    label: check.label,
    state: check.state,
    breached: check.breached,
    count: check.count,
    source: check.source || null,
    reason: check.reason || null,
    runtimeMs: round(check.runtimeMs)
  }));
  result.breachStatus = unavailable ? 'unavailable' : 'checked';
  result.unavailable = unavailable;
  result.timings.push({ label: `Pwned Passwords (${pwned.checks.length} bounded lookup${pwned.checks.length === 1 ? '' : 's'}, parallel)`, ms: round(pwned.runtimeMs) });
  result.totalRuntimeMs = round(now() - result._internal.totalStarted);
  delete result._internal;
  return result;
}

function analyzePassword(password, options = {}) {
  const result = createBaseResult(password, options);
  delete result._internal;
  return result;
}

async function analyzePasswordAsync(password, options = {}) {
  const result = createBaseResult(password, options);
  if (options.breachCheck === false) {
    delete result._internal;
    return result;
  }
  const pwned = await checkPwned(result._internal.candidates, options.pwned || {});
  return finish(result, pwned);
}

module.exports = { analyzePassword, analyzePasswordAsync, grade, band };
