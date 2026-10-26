const { isQuestion } = require('./detector');
const { findDuplicate, hasVagueReference } = require('./merger');
const { judgeSameQuestion, getAiStatus, subscribeStatus } = require('./ai');
const questions = [];
const newcomers = [];
const botLog = [];
const listeners = new Set();
let nextId = 1;
let onScreenId = null;
let theme = 'twitch';
let lessAnimation = false;
let streamerLang = 'fr';
let twitchStatus = { status: 'off', channel: null };
const keyFor = (username) => username.trim().toLocaleLowerCase();
function addBotMessage(message) {
  botLog.push({ id: Date.now() + Math.random(), text: message, createdAt: new Date().toISOString() });
  if (botLog.length > 20) botLog.splice(0, botLog.length - 20);
}
function snapshot() {
  return {
    questions: questions.map((q) => ({
      id: q.id, text: q.text, originalText: q.originalText || q.text, lang: q.lang || 'other', displayedText: q.displayedText || q.text, author: q.author, votes: [...q.votes],
      voteCount: q.votes.size, status: q.status, createdAt: q.createdAt,
      mergedFrom: q.mergedFrom.map((message) => ({ ...message })),
    })),
    botLog: botLog.map((entry) => ({ ...entry })),
    newcomers: newcomers.map(({ key, ...person }) => ({ ...person })),
    onScreenId,
    theme,
    lessAnimation,
    aiStatus: getAiStatus(),
    streamerLang,
    twitchStatus: { ...twitchStatus },
  };
}
function publish() {
  const state = snapshot();
  for (const listener of listeners) listener(state);
}
function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function markFirstTimeChatter(username) {
  if (typeof username !== 'string' || !username.trim()) return;
  const author = username.trim().slice(0, 80);
  const key = keyFor(author);
  if (newcomers.some((person) => person.key === key)) return;
  newcomers.push({ key, username: author, greeted: false, createdAt: new Date().toISOString() });
  publish();
}
function setTwitchStatus(status, channel = null) {
  const next = { status, channel: status === 'connected' ? channel : null };
  if (twitchStatus.status === next.status && twitchStatus.channel === next.channel) return;
  twitchStatus = next;
  publish();
}
subscribeStatus(() => publish());
function mergeInto(question, message) {
  const voter = keyFor(message.username);
  question.votes.add(voter);
  question.mergedFrom.push({ username: message.username, text: message.text, at: message.at });
  addBotMessage('Same as #' + question.id + ', counted');
}
function mergeByAiLater(createdQuestion, candidates) {
  if (getAiStatus() !== 'on') return;
  const requestLang = streamerLang;
  judgeSameQuestion(createdQuestion.text, candidates, requestLang).then((result) => {
    if (!result) { publish(); return; }
    const source = questions.find((item) => item.id === createdQuestion.id && item.status === 'open');
    if (!source) { publish(); return; }
    source.lang = result.lang || 'other';
    if (result.targetLang && result.translation) {
      source.translationText = result.translation;
      source.translationLang = result.targetLang;
    }
    source.displayedText = source.translationLang === streamerLang ? source.translationText : source.originalText;
    if (result.matchId === null) { publish(); return; }
    const target = questions.find((item) => item.id === result.matchId && item.status === 'open');
    if (!target || source.id === target.id) { publish(); return; }
    if ((hasVagueReference(source.text) || hasVagueReference(target.text)) && Math.abs(Date.parse(source.createdAt) - Date.parse(target.createdAt)) > 90000) { publish(); return; }
    const duplicateMessage = { username: source.author, text: source.text, at: source.createdAt };
    for (const voter of source.votes) target.votes.add(voter);
    target.mergedFrom.push(duplicateMessage, ...source.mergedFrom);
    questions.splice(questions.indexOf(source), 1);
    if (onScreenId === source.id) onScreenId = target.id;
    addBotMessage('Same as #' + target.id + ', counted');
    publish();
  }).catch(() => publish());
}
function ingestMessage({ username, text }) {
  if (typeof username !== 'string' || !username.trim()) throw new TypeError('username is required');
  if (typeof text !== 'string' || !text.trim()) throw new TypeError('text is required');
  const author = username.trim().slice(0, 80);
  const message = text.trim().slice(0, 500);
  if (!isQuestion(message)) return { changed: false, state: snapshot() };
  const at = new Date().toISOString();
  const incoming = { text: message, author, createdAt: at };
  const duplicate = findDuplicate(incoming, questions.filter((question) => question.status === 'open'));
  if (duplicate) {
    const existing = questions.find((question) => question.id === duplicate.id && question.status === 'open');
    if (existing) {
      const authorKey = keyFor(author);
      if (!newcomers.some((person) => person.key === authorKey)) newcomers.push({ key: authorKey, username: author, greeted: false, createdAt: at });
      mergeInto(existing, { username: author, text: message, at });
      publish();
      return { changed: true, state: snapshot(), questionId: existing.id, merged: true };
    }
  }
  const authorKey = keyFor(author);
  if (!newcomers.some((person) => person.key === authorKey)) newcomers.push({ key: authorKey, username: author, greeted: false, createdAt: at });
  const question = {
    id: nextId++, text: message, originalText: message, lang: 'other', displayedText: message, translationText: null, translationLang: null, author, votes: new Set([authorKey]),
    status: 'open', createdAt: at, mergedFrom: [],
  };
  const candidates = questions.filter((item) => item.status === 'open').map((item) => ({ id: item.id, text: item.text, createdAt: item.createdAt, status: item.status }));
  questions.push(question);
  addBotMessage('Question #' + question.id + ' added.');
  publish();
  mergeByAiLater(question, candidates);
  return { changed: true, state: snapshot(), questionId: question.id, merged: false };
}
function setQuestionStatus(id, status) {
  const question = questions.find((item) => item.id === Number(id));
  if (!question) return { error: 'Question not found', statusCode: 404 };
  if (question.status !== 'open') return { error: 'Question is no longer open', statusCode: 409 };
  question.status = status;
  if (onScreenId === question.id) onScreenId = null;
  addBotMessage('Question #' + question.id + ' ' + status + '.');
  publish();
  return { state: snapshot() };
}
function splitMergedMessage(id, index) {
  const question = questions.find((item) => item.id === Number(id));
  if (!question) return { error: 'Question not found', statusCode: 404 };
  if (question.status !== 'open') return { error: 'Question is no longer open', statusCode: 409 };
  if (!Number.isInteger(index) || index < 0 || index >= question.mergedFrom.length) return { error: 'Merged message not found', statusCode: 404 };
  const [message] = question.mergedFrom.splice(index, 1);
  question.votes.delete(keyFor(message.username));
  const authorKey = keyFor(message.username);
  const splitQuestion = {
    id: nextId++, text: message.text, originalText: message.text, lang: 'other', displayedText: message.text, translationText: null, translationLang: null, author: message.username,
    votes: new Set([authorKey]), status: 'open', createdAt: message.at, mergedFrom: [],
  };
  questions.push(splitQuestion);
  addBotMessage('Question #' + splitQuestion.id + ' split from #' + question.id + '.');
  publish();
  return { state: snapshot(), questionId: splitQuestion.id };
}
function greetNewcomer(username) {
  const newcomer = newcomers.find((person) => person.key === keyFor(username));
  if (!newcomer) return { error: 'Newcomer not found', statusCode: 404 };
  if (!newcomer.greeted) {
    newcomer.greeted = true;
    addBotMessage('Welcome to chat, ' + newcomer.username + '!');
    publish();
  }
  return { state: snapshot() };
}
function setStreamerLang(value) {
  if (!['fr', 'en', 'es'].includes(value)) return { error: 'Invalid streamer language', statusCode: 400 };
  if (streamerLang !== value) {
    streamerLang = value;
    for (const question of questions) question.displayedText = question.translationLang === streamerLang ? question.translationText : question.originalText;
    publish();
  }
  return { state: snapshot() };
}
function setOnScreen(id) {
  const question = questions.find((item) => item.id === Number(id) && item.status === 'open');
  if (!question) return { error: 'Open question not found', statusCode: 404 };
  onScreenId = question.id;
  publish();
  return { state: snapshot() };
}
function clearScreen() {
  if (onScreenId !== null) { onScreenId = null; publish(); }
  return { state: snapshot() };
}
function setTheme(value) {
  if (!['twitch', 'cuisine', 'jeux'].includes(value)) return { error: 'Invalid theme', statusCode: 400 };
  if (theme !== value) { theme = value; publish(); }
  return { state: snapshot() };
}
function setLessAnimation(value) {
  lessAnimation = Boolean(value);
  publish();
  return { state: snapshot() };
}
function reset() {
  questions.splice(0);
  onScreenId = null;
  newcomers.splice(0);
  botLog.splice(0);
  nextId = 1;
  publish();
  return snapshot();
}
module.exports = { ingestMessage, snapshot, subscribe, setQuestionStatus, splitMergedMessage, greetNewcomer, setOnScreen, clearScreen, setTheme, setLessAnimation, setStreamerLang, markFirstTimeChatter, setTwitchStatus, reset };
