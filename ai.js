require('./env');
const { normalizeTokens } = require('./merger');
const AI_INSTRUCTION = 'Do these two chat questions ask the same thing? Questions may be in any language. Answer only JSON: {"same": true|false}';
const TIMEOUT_MS = 15000;
const RATE_LIMIT_MS = 60000;
const resultCache = new Map();
const statusListeners = new Set();
let rateLimitedUntil = 0;
let rateLimitTimer = null;
function getAiStatus() {
  if (!process.env.GEMINI_API_KEY || !process.env.GEMINI_MODEL) return 'off';
  return Date.now() < rateLimitedUntil ? 'rate-limited' : 'on';
}
function subscribeStatus(listener) {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}
function notifyStatus() {
  for (const listener of statusListeners) { try { listener(getAiStatus()); } catch {} }
}
function safeLogText(value, apiKey) {
  let text = String(value || '');
  if (apiKey) text = text.split(apiKey).join('[REDACTED]');
  return text.slice(0, 150).replace(/[\r\n\t]+/g, ' ');
}
function cacheKey(text) {
  const tokens = normalizeTokens(text);
  if (tokens.length) return tokens.join(' ');
  return String(text || '').toLocaleLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().replace(/\s+/g, ' ');
}
function parseGeminiResult(text, allowedIds) {
  const fence = String.fromCharCode(96, 96, 96);
  let source = String(text || '').trim().replace(new RegExp('^\\s*' + fence + '(?:json)?\\s*', 'i'), '').replace(new RegExp('\\s*' + fence + '\\s*$', 'i'), '');
  const start = source.indexOf('{'), end = source.lastIndexOf('}');
  if (start < 0 || end < start) return { valid: false };
  let parsed;
  try { parsed = JSON.parse(source.slice(start, end + 1)); }
  catch { return { valid: false }; }
  if (!parsed || !Object.prototype.hasOwnProperty.call(parsed, 'matchId')) return { valid: false };
  if (parsed.matchId !== null && (!Number.isInteger(parsed.matchId) || !allowedIds.has(parsed.matchId))) return { valid: false };
  if (!['fr', 'en', 'es', 'other'].includes(parsed.lang)) return { valid: false };
  if (typeof parsed.translation !== 'string' || !parsed.translation.trim()) return { valid: false };
  return { valid: true, matchId: parsed.matchId, lang: parsed.lang, translation: parsed.translation.trim() };
}
async function requestGemini(question, openQuestions, streamerLang) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL;
  if (!apiKey || !model) return null;
  const allowedIds = new Set(openQuestions.map((item) => item.id));
  const prompt = AI_INSTRUCTION + '\nCompare the new question to the open questions below and return the id of the single best same-meaning question, or null if none match. Also identify the input language as fr, en, es, or other, and translate the question into ' + streamerLang + ' (return the same text if it is already in that language). For this combined response, return only JSON with this shape: {"matchId": <id or null>, "lang": "fr|en|es|other", "translation": "..."}.\nNew question: ' + JSON.stringify(question) + '\nOpen questions: ' + JSON.stringify(openQuestions.map(({ id, text }) => ({ id, text })));
  const controller = new AbortController();
  let timeout;
  const operation = (async () => {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json' } }),
      signal: controller.signal,
    });
    let responseBody;
    try { responseBody = await response.text(); }
    catch (error) { return { error: 'response-body', status: response.status, body: error.message }; }
    if (response.status === 429) return { rateLimited: true, status: response.status, body: responseBody };
    if (!response.ok) return { error: 'http', status: response.status, body: responseBody };
    let payload;
    try { payload = JSON.parse(responseBody); }
    catch { return { error: 'response-json', status: response.status, body: responseBody }; }
    const output = payload && payload.candidates && payload.candidates[0] && payload.candidates[0].content && payload.candidates[0].content.parts ? payload.candidates[0].content.parts.map((part) => part.text || '').join('') : '';
    if (!output) return { error: 'match-json', status: response.status, body: responseBody };
    const parsed = parseGeminiResult(output, allowedIds);
    return parsed.valid ? { ...parsed, targetLang: streamerLang } : { error: 'match-json', status: response.status, body: responseBody };
  })();
  const startedAt = Date.now();
  try {
    const result = await Promise.race([operation, new Promise((resolve) => { timeout = setTimeout(() => { controller.abort(); resolve({ error: 'timeout' }); }, TIMEOUT_MS); })]);
    if (result.rateLimited) {
      rateLimitedUntil = Date.now() + RATE_LIMIT_MS;
      if (rateLimitTimer) clearTimeout(rateLimitTimer);
      rateLimitTimer = setTimeout(() => { rateLimitedUntil = 0; rateLimitTimer = null; notifyStatus(); }, RATE_LIMIT_MS + 25);
      rateLimitTimer.unref && rateLimitTimer.unref();
      notifyStatus();
      console.warn('[AI] Gemini HTTP ' + result.status + ': ' + safeLogText(result.body, apiKey) + ' (rate limited; pausing for 60 seconds)');
      return null;
    }
    if (result.error) {
      if (result.error === 'timeout') console.warn('[AI] Gemini request timed out after ' + (Date.now() - startedAt) + 'ms');
      else if (result.status !== undefined) console.warn('[AI] Gemini HTTP ' + result.status + ': ' + safeLogText(result.body, apiKey));
      else console.warn('[AI] Gemini request failed: ' + safeLogText(result.body || result.message || result.error, apiKey));
      return null;
    }
    return result;
  } catch (error) {
    const causeCode = error && error.cause && error.cause.code;
    console.warn('[AI] Gemini network error' + (causeCode ? ' (' + causeCode + ')' : '') + ': ' + safeLogText(error && error.message, apiKey));
    return null;
  } finally { if (timeout) clearTimeout(timeout); }
}
async function judgeSameQuestion(a, openQuestions, streamerLang) {
  if (getAiStatus() !== 'on' || !Array.isArray(openQuestions)) return null;
  const key = cacheKey(a);
  if (!key) return null;
  let pending = resultCache.get(key);
  if (!pending) {
    pending = requestGemini(a, openQuestions, streamerLang).catch(() => null);
    resultCache.set(key, pending);
  }
  const result = await pending;
  if (!result) return null;
  return { ...result, matchId: result.matchId !== null && openQuestions.some((item) => item.id === result.matchId) ? result.matchId : null, translation: result.targetLang === streamerLang ? result.translation : a, targetLang: result.targetLang === streamerLang ? result.targetLang : null };
}
module.exports = { judgeSameQuestion, getAiStatus, subscribeStatus, AI_INSTRUCTION, parseGeminiResult };
