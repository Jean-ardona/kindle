const STOPWORDS = new Set((
  'a an and are as at be been being but by can could did do does doing for from had has have how i in is it its may might of on or our should so than that the their them then there these they this those to too up us was we were what when where which who why will with would you your ' +
  'au aux avec ce ces dans de des du elle en et eux il la le les leur lui ma mais me même mes moi mon ne nos notre nous on ou par pas pour qu que quelle quelles quel quels qui sa sans se ses si son sont sous sur ta te tes toi ton tu un une vos votre vous c est été être suis es ai as ' +
  'a al algo algunas algunos ante aquel aquella aquellas aquellos aqui asi bajo cada como con contra cual cuales cuando de del desde donde durante e el ella ellas ellos en entre era erais eran eras eres es esa esas ese eso esos esta estaba estaban estado estas este esto estos estoy estas estan estar estas estuve fue fueron ha habia han hasta hay la las le les lo los mas me mi mis mucha mucho muy nada ni no nos o os otra otras otro otros para pero poco por porque que quien quienes se sin sobre su sus te tener tiene tienen todo todos tras tu tus un una uno unos unas y ya hacer'
).split(/\s+/));
const SYNONYMS = new Map([
  ['start','start'],['started','start'],['starting','start'],['begin','start'],['began','start'],['begun','start'],
  ['commence','start'],['commences','start'],['commenced','start'],['commencer','start'],['commencee','start'],['commences','start'],
  ['empezar','start'],['empieza','start'],['empiezas','start'],['empezo','start'],['empezaste','start'],['empezamos','start'],['empezando','start'],
]);
const VAGUE = new Set(['that','this','it','ca','ce','cela','eso','esto']);
function normalizeTokens(text) {
  return String(text || '').toLocaleLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/)
    .filter((token) => token && !STOPWORDS.has(token)).map((token) => SYNONYMS.get(token) || token);
}
function hasVagueReference(text) {
  const tokens = String(text || '').toLocaleLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/);
  return tokens.some((token) => VAGUE.has(token));
}
function findDuplicate(newQuestion, openQuestions) {
  const incomingTokens = new Set(normalizeTokens(newQuestion.text));
  if (!incomingTokens.size) return null;
  const incomingTime = Date.parse(newQuestion.createdAt || newQuestion.at || new Date().toISOString());
  let best = null;
  for (const question of openQuestions || []) {
    if (question.status && question.status !== 'open') continue;
    const existingTokens = new Set(normalizeTokens(question.text));
    if (!existingTokens.size) continue;
    if ((hasVagueReference(newQuestion.text) || hasVagueReference(question.text)) &&
        Math.abs(incomingTime - Date.parse(question.createdAt)) > 90000) continue;
    let intersection = 0;
    for (const token of incomingTokens) if (existingTokens.has(token)) intersection++;
    const union = new Set([...incomingTokens, ...existingTokens]).size;
    const similarity = intersection / union;
    if (similarity >= 0.6 && (!best || similarity > best.similarity ||
        (similarity === best.similarity && Date.parse(question.createdAt) < Date.parse(best.question.createdAt)))) {
      best = { id: question.id, similarity, question };
    }
  }
  return best ? { id: best.id } : null;
}
module.exports = { findDuplicate, normalizeTokens, hasVagueReference };
