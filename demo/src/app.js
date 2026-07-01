import { analyzePasswordAsync } from 'asdf-fox';

'use strict';

const passwordInput = document.querySelector('#password');
const contextInput = document.querySelector('#context');
const breachCheckInput = document.querySelector('#breach-check');
const analyzeButton = document.querySelector('#analyse');
const visibilityButton = document.querySelector('#visibility');
const status = document.querySelector('#status');
const empty = document.querySelector('#empty');
const results = document.querySelector('#results');

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function ms(value) {
  return `${Number(value).toFixed(2)} ms`;
}

function count(value) {
  return Number(value).toLocaleString('en-US');
}

function sourceLabel(match) {
  return match.confidence === 'frequency-ranked' ? 'common word or name' : 'current name or term';
}

function suggestionPanel(feedback) {
  const lines = [feedback.warning, ...(feedback.suggestions || [])].filter(Boolean);
  if (!lines.length) return '';
  return `<section class="panel"><h2>Suggestions</h2><ul>${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul></section>`;
}

function render(data) {
  const exact = data.exactPwned;
  const exactBlock = !exact
    ? '<p class="notice neutral">Pwned Passwords was not checked for this result.</p>'
    : exact.state === 'unavailable'
      ? `<p class="notice neutral">Could not check Pwned Passwords: ${escapeHtml(exact.reason)}.</p>`
      : exact.breached
        ? `<p class="notice danger">This exact password appears ${count(exact.count)} times in Pwned Passwords.</p>`
        : '<p class="notice good">No exact match was found in Pwned Passwords. That does not prove that the password is unique or safe.</p>';

  const variants = !exact
    ? '<p>Pwned Passwords was not checked for this result.</p>'
    : data.closeVariantWarnings.length
      ? `<ul class="warning-list">${data.closeVariantWarnings.map((warning) => `<li>${escapeHtml(warning.label)} matches a breached password (${count(warning.count)} occurrences). This is an easy variation of a compromised password.</li>`).join('')}</ul>`
      : '<p>No easy variation was found. Longer random-looking suffixes are not stripped and checked.</p>';

  const visibleDetections = data.structuralDetections.filter((detection) => detection.selectedInComposite);
  const structures = visibleDetections.length
    ? `<div class="cards">${visibleDetections.map((detection) => `<article class="detector ${escapeHtml(detection.severity)}"><h3>${escapeHtml(detection.title)}</h3><p>${escapeHtml(detection.detail)}</p></article>`).join('')}</div>`
    : '<p>No extra repeat or number rule changed this result.</p>';

  const checks = data.pwnedChecks.map((check) => `<tr><td>${escapeHtml(check.label)}</td><td>${check.state === 'unavailable' ? 'unavailable' : check.breached ? `match (${count(check.count)})` : 'no match'}</td><td>${ms(check.runtimeMs)}</td></tr>`).join('');
  const timings = data.timings.map((timing) => `<tr><td>${escapeHtml(timing.label)}</td><td>${ms(timing.ms)}</td></tr>`).join('');

  const lexicon = data.modernLexicon;
  const lexiconMatches = lexicon.matches.length
    ? `<div class="lexicon-matches">${lexicon.matches.map((match) => {
      const notes = [sourceLabel(match)];
      if (match.raw && match.raw !== match.token) notes.push(`typed as “${escapeHtml(match.raw)}”`);
      if (match.caseLog10Bonus > 0) notes.push(match.caseKind);
      if (match.leetLog10Bonus > 0) notes.push(`${match.leetSubstitutionCount} standard leet substitution${match.leetSubstitutionCount === 1 ? '' : 's'}`);
      return `<article class="lexicon-match"><h3>${escapeHtml(match.token)}</h3><span>${notes.join(' · ')}</span></article>`;
    }).join('')}</div>`
    : '<p>No recognizable word or name from the included list was found.</p>';

  const vocabularySummary = data.score.changedByLexicon
    ? `lowered estimate to log10 ${data.score.lexiconLog10}`
    : 'no change';
  const structureSummary = data.score.changedByStructure ? 'lowered estimate' : 'no change';

  results.innerHTML = `
    <section class="summary panel ${escapeHtml(data.score.band.level)}">
      <div><p class="eyebrow">RESULT</p><h2>${escapeHtml(data.score.band.label)}</h2><p class="score">log<sub>10</sub> guesses: <strong>${data.score.effectiveLog10}</strong></p></div>
      <dl>
        <div><dt>Baseline</dt><dd>log<sub>10</sub> ${data.score.baselineLog10}</dd></div>
        <div><dt>Words and names</dt><dd>${vocabularySummary}</dd></div>
        <div><dt>Patterns</dt><dd>${structureSummary}</dd></div>
        <div><dt>Time</dt><dd>${ms(data.totalRuntimeMs)}</dd></div>
      </dl>
    </section>
    <section class="grid-two">
      <article class="panel"><h2>Pwned Passwords</h2>${exactBlock}${exact ? `<p class="subtle">${ms(exact.runtimeMs)}${exact.source ? ` · ${escapeHtml(exact.source)}` : ''}</p>` : ''}</article>
      <article class="panel"><h2>Easy variations</h2>${variants}</article>
    </section>
    <section class="panel"><h2>Recognized words and names</h2><p class="subtle">Checked locally from the included word and name lists, including current names and terms that plain zxcvbn may miss.</p>${lexiconMatches}</section>
    <section class="panel"><h2>Patterns noticed</h2>${structures}</section>
    <section class="grid-two">
      <article class="panel"><h2>Pwned Passwords lookups</h2>${data.pwnedChecks.length ? `<div class="table-wrap"><table><thead><tr><th>Checked</th><th>Result</th><th>Time</th></tr></thead><tbody>${checks}</tbody></table></div>` : '<p>Pwned Passwords was not checked for this result.</p>'}</article>
      <article class="panel"><h2>Timing</h2><div class="table-wrap"><table><thead><tr><th>Step</th><th>Time</th></tr></thead><tbody>${timings}</tbody></table></div></article>
    </section>

    ${suggestionPanel(data.zxcvbnFeedback)}`;
  results.hidden = false;
  empty.hidden = true;
}

async function analyze() {
  const password = passwordInput.value;
  if (!password) {
    status.textContent = 'Enter a password first.';
    passwordInput.focus();
    return;
  }
  analyzeButton.disabled = true;
  status.textContent = breachCheckInput.checked ? 'Checking password…' : 'Checking locally…';
  try {
    const data = await analyzePasswordAsync(password, {
      context: contextInput.value,
      breachCheck: breachCheckInput.checked
    });
    render(data);
    status.textContent = `Done in ${ms(data.totalRuntimeMs)}.`;
  } catch (error) {
    status.textContent = `Could not analyze: ${error.message}`;
  } finally {
    analyzeButton.disabled = false;
  }
}

analyzeButton.addEventListener('click', analyze);
passwordInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') analyze();
});
visibilityButton.addEventListener('click', () => {
  const visible = passwordInput.type === 'text';
  passwordInput.type = visible ? 'password' : 'text';
  visibilityButton.textContent = visible ? 'Show' : 'Hide';
  visibilityButton.setAttribute('aria-label', visible ? 'Show password' : 'Hide password');
});
document.querySelectorAll('[data-sample]').forEach((button) => {
  button.addEventListener('click', () => {
    passwordInput.value = button.dataset.sample;
    passwordInput.focus();
  });
});
