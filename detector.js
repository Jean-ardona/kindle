const QUESTION_WORDS = ['why','how','what','when','where','who','can','does','is','are','should','pourquoi','comment','quoi','quand','où','qui','est-ce','por qué','cómo','qué','cuándo','dónde','quién'];
function isQuestion(text) {
  const value = String(text || '').trim().toLocaleLowerCase();
  if (!value) return false;
  if (value.endsWith('?')) return true;
  return QUESTION_WORDS.some((word) => {
    if (!value.startsWith(word)) return false;
    const next = value.slice(word.length, word.length + 1);
    return !next || !/[\p{L}\p{M}-]/u.test(next);
  });
}
module.exports = { isQuestion };
