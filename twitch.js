require('./env');
const tls = require('node:tls');
const { StringDecoder } = require('node:string_decoder');
const { ingestMessage, markFirstTimeChatter, setTwitchStatus } = require('./store');

const HOST = 'irc.chat.twitch.tv';
const PORT = 6697;
const MAX_RECONNECT_MS = 30000;

function decodeTag(value) {
  return String(value || '').replace(/\\:/g, ';').replace(/\\s/g, ' ').replace(/\\r/g, '\r').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
}

function startTwitchChat() {
  const channel = String(process.env.TWITCH_CHANNEL || '').trim().replace(/^#/, '').toLocaleLowerCase();
  if (!channel) {
    setTwitchStatus('off');
    return { stop() {} };
  }

  let reconnectDelay = 2000;
  let reconnectTimer = null;
  let socket = null;
  let stopped = false;
  let joined = false;
  let closeHandled = false;
  let nickname = '';

  function scheduleReconnect() {
    if (stopped || reconnectTimer) return;
    setTwitchStatus('connecting');
    const delay = reconnectDelay;
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_MS);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
    if (reconnectTimer.unref) reconnectTimer.unref();
  }

  function handleLine(line) {
    if (line.startsWith('PING')) {
      const payload = line.slice(4).trim();
      if (socket && !socket.destroyed) socket.write('PONG' + (payload ? ' ' + payload : '') + '\r\n');
      return;
    }
    const message = line.match(/^(?:@([^ ]+) )?:([^ ]+) PRIVMSG #[^ ]+ :(.*)$/);
    if (message) {
      const tags = Object.create(null);
      for (const pair of (message[1] || '').split(';')) {
        const split = pair.indexOf('=');
        if (split >= 0) tags[pair.slice(0, split)] = decodeTag(pair.slice(split + 1));
      }
      const nick = message[2].split('!')[0];
      const username = tags['display-name'] || nick;
      if (tags['first-msg'] === '1') markFirstTimeChatter(username);
      try { ingestMessage({ username, text: message[3] }); }
      catch (error) { console.warn('[Twitch] Ignoring invalid chat message:', error.message); }
      return;
    }
    if (!joined && /^:[^ ]+ 366 /.test(line)) {
      joined = true;
      reconnectDelay = 2000;
      setTwitchStatus('connected', '#' + channel);
    }
  }

  function connect() {
    if (stopped) return;
    joined = false;
    closeHandled = false;
    setTwitchStatus('connecting');
    nickname = 'justinfan' + Math.floor(10000 + Math.random() * 90000);
    const decoder = new StringDecoder('utf8');
    let buffer = '';
    socket = tls.connect({ host: HOST, port: PORT, servername: HOST });
    socket.setTimeout(15000, () => socket.destroy(new Error('IRC connection timed out')));
    socket.on('secureConnect', () => {
      socket.setTimeout(0);
      socket.write('CAP REQ :twitch.tv/tags\r\n');
      socket.write('PASS SCHMOOPIIE\r\n');
      socket.write('NICK ' + nickname + '\r\n');
    });
    socket.on('data', (chunk) => {
      buffer += decoder.write(chunk);
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/, '');
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        if (/^:[^ ]+ 001 /.test(line)) socket.write('JOIN #' + channel + '\r\n');
        handleLine(line);
      }
      if (buffer.length > 16384) buffer = '';
    });
    socket.on('error', (error) => {
      if (!stopped) console.warn('[Twitch] IRC connection error:', error.message);
    });
    socket.on('close', () => {
      if (closeHandled) return;
      closeHandled = true;
      socket = null;
      joined = false;
      scheduleReconnect();
    });
  }

  connect();
  return {
    stop() {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = null;
      if (socket) socket.destroy();
      socket = null;
      setTwitchStatus('off');
    },
  };
}

module.exports = { startTwitchChat, decodeTag };
