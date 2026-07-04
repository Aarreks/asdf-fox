'use strict';

const { zxcvbn, parseContext } = require('./zxcvbn');
const { metadata: modernLexiconMetadata, scoreLexiconAware } = require('./modernLexicon');
const { scoreRecoveredLocalDictionaryParse } = require('./localDictionaryRecovery');
const { metadata: commonBigramMetadata, scoreCommonBigramPatterns } = require('./commonBigrams');
const { detectStructure, applyStructuralCaps } = require('./heuristics');
const { buildVariantCandidates } = require('./variants');
const { checkPwned } = require('./pwned');

function now() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function round(value) {
  if (!Number.isFinite(value)) throw new TypeError('round() requires a finite number.');
  return Number(value.toFixed(2));
}

// Detector fields are evidence metadata, not required score inputs. Some
// deliberately use null to express that a cost does not apply (for example,
// the legacy simple period-2 detector has no reconstruction cost). Keep those
// values serializable without letting optional evidence prevent analysis.
function roundOptional(value) {
  return Number.isFinite(value) ? round(value) : null;
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
  // Pass the cached baseline scorer so the interleaving detector can ask
  // zxcvbn whether both recovered every-other-character streams are already
  // recognizable structures, rather than limiting itself to hard-coded runs.
  const detections = detectStructure(password, baseScore);
  const structural = applyStructuralCaps(preStructuralLog10, detections, (root) => {
    const rootResult = scoreLexiconAware(root, baseScore);
    return { guessesLog10: rootResult.effectiveLog10 };
  });
  timings.push({ label: 'deterministic structure detectors', ms: round(now() - structuralStarted) });

  const variantsStarted = now();
  const candidates = buildVariantCandidates(password);
  timings.push({ label: 'limited variant construction', ms: round(now() - variantsStarted) });

  const collocationsStarted = now();
  const commonBigrams = scoreCommonBigramPatterns(password, structural.effectiveLog10);
  timings.push({ label: 'common bigram adjustment', ms: round(now() - collocationsStarted) });

  const currentLog10 = commonBigrams.effectiveLog10;
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
      changedByStructure: structural.adjustments.length > 0,
      changedByCommonBigrams: commonBigrams.changed
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
    commonBigramPatterns: commonBigrams.composition ? {
      ...commonBigramMetadata(),
      candidateLog10: round(commonBigrams.composition.candidateLog10),
      totalReductionLog10: round(commonBigrams.composition.totalReductionLog10),
      patterns: commonBigrams.composition.patterns.map((pattern) => ({
        words: pattern.words,
        uncoveredCharacters: pattern.uncoveredCharacters,
        reductionLog10: round(pattern.reductionLog10),
        hits: pattern.hits.map((hit) => ({
          left: hit.left,
          right: hit.right,
          count: hit.count,
          separator: hit.separator,
          reductionLog10: round(hit.reductionLog10)
        })),
        selectedPairs: pattern.selectedPairs.map((pair) => ({
          left: pair.left,
          right: pair.right,
          count: pair.count,
          separator: pair.separator,
          reductionLog10: round(pair.reductionLog10),
          pairFloorLog10: round(pair.pairFloorLog10)
        }))
      }))
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
      rootBaselineLog10: roundOptional(detection.rootBaselineLog10),
      bridgeBaselineLog10: roundOptional(detection.bridgeBaselineLog10),
      prefixBaselineLog10: roundOptional(detection.prefixBaselineLog10),
      suffixBaselineLog10: roundOptional(detection.suffixBaselineLog10),
      sequenceModelLog10: roundOptional(detection.sequenceModelLog10),
      counterEdgeLayoutLog10: roundOptional(detection.counterEdgeLayoutLog10),
      structuralCandidateLog10: roundOptional(detection.structuralCandidateLog10),
      interleavePeriod: Number.isInteger(detection.period) ? detection.period : null,
      interleaveStreams: Array.isArray(detection.streams) ? detection.streams : null,
      interleaveRecognizedStreamIndexes: Array.isArray(detection.recognizedStreamIndexes)
        ? detection.recognizedStreamIndexes
        : null,
      interleaveStreamBaselineLog10: Array.isArray(detection.streamBaselineLog10)
        ? detection.streamBaselineLog10.map((value) => roundOptional(value))
        : null,
      interleaveReconstructionLog10: roundOptional(detection.reconstructionLog10),
      interleaveEvidenceLog10: roundOptional(detection.evidenceLog10),
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
      commonBigrams: 'The optional common-bigram stage is a local, exact lookup over a filtered 100,000-entry count table. It can recover a known pair within an alphabetic run while retaining surrounding literal residue in the baseline estimate. It never bridges an uncovered internal character. Each pair is discounted by at most the easier word cost, retains an explicit directional order cost, and cannot reuse a middle word in adjacent matches. It is a bounded lexical adjustment, not phrase recognition or a semantic score.',
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
