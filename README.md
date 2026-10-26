# Kindle

**The best question rises.**

Kindle is a question queue for Twitch streamers. It watches chat, picks out the questions on its own, merges the ones that ask the same thing (even across languages), and lets the streamer put one on stream with a single key press.

Built for the Codex x TwitchCon Hackathon. Every line of code was written with OpenAI Codex.

## The problem

When a stream gets busy, good questions disappear in the scroll. Viewers ask the same thing five times in three languages, the streamer answers the loudest message, and newcomers never get noticed.

## What Kindle does

- **Detects questions automatically.** Viewers type normally. No commands, no special syntax.
- **Merges duplicates.** When someone asks something that was already asked, Kindle adds a vote to the existing question instead of creating a new card. The more people ask, the higher it rises.
- **Works across languages.** "How did you start streaming?", "Comment as-tu commencé le streaming ?" and "¿cómo empezaste a hacer streaming?" become one question.
- **Translates into the streamer's language.** The streamer reads the question in their own language, with the original shown underneath.
- **Heat levels.** Spark (1), Ember (2-3), Flame (4-5), Blaze (6+). Shown as both a color and a number, never color alone.
- **Stream overlay.** One key press puts the active question on screen through a transparent OBS browser source.
- **Newcomer card.** Spots first-time chatters so the streamer can say hello.
- **Three themes.** Twitch, Cuisine, Jeux. Built for any kind of streamer, not only coders.

## How merging works

1. **Local layer** (works offline): normalized word overlap (lowercase, no accents or punctuation, stopwords removed in English, French and Spanish).
2. **AI layer** (optional, Gemini): one call per new question returns the matching open question, the detected language and the translation. If the AI is off, slow or rate-limited, Kindle keeps working with the local layer. It never blocks the chat.
3. **Vague questions** such as "why did you do that?" only merge when asked within 90 seconds of each other, so unrelated questions are not glued together.
4. **Always reversible.** Every merged message is listed under the question, with a **Split** button to undo a wrong merge.

## Run it

Requires Node.js. There are no dependencies to install.

```
npm start
```

Then open:

| Page | URL | Purpose |
| --- | --- | --- |
| Streamer panel | `http://localhost:3000/panel` | Queue, themes, language, on-screen control |
| Chat simulator | `http://localhost:3000/simulator` | Fake multi-user chat and a demo script |
| Overlay | `http://localhost:3000/overlay` | Add as an OBS Browser Source (transparent background) |

Use `/overlay?preview=1` to see the overlay on a checkerboard in a normal browser.

### Keyboard shortcuts (panel)

`J` / `K` move between questions, `Enter` puts the selected question on screen, `R` marks it answered.

### Optional: turn on the AI layer

1. Get a free key at [Google AI Studio](https://aistudio.google.com).
2. Copy `.env.example` to `.env` and fill in your key and model.
3. Restart `npm start`. The simulator shows **AI: on** when it is working.

Without a key, everything still works except cross-language merging and translation.

## Twitch connection

> Fill this section in once the live connection works. Describe exactly what is connected and how, for example which Twitch API or chat connection is used, and what the streamer needs to do to link their channel.

Chat enters Kindle through a single `ingestMessage` function. The simulator and the Twitch connection feed the same function, so the rest of the app does not change.

## How Codex was used

The whole project was built in a single Codex thread: the streamer panel and its design system, the backend and live event stream, the duplicate merger, the AI layer with its failure handling, the overlay, and the simulator. Each step was a focused prompt, tested in the browser before the next one.

## Project layout

| File | Role |
| --- | --- |
| `server.js` | HTTP server, API, live event stream |
| `store.js` | Questions, votes, merged messages, on-screen state |
| `detector.js` | Finds questions in chat messages |
| `merger.js` | Local duplicate detection |
| `ai.js` | Gemini call: matching, language, translation |
| `env.js` | Reads `.env` |
| `index.html` | Streamer panel |
| `overlay.html` | OBS overlay |
| `simulator.html` | Fake chat and demo script |
| `DESIGN.md` | Design rules |

## Design

Dark-only, Twitch-adjacent palette, stacked question cards and a floating action bar. Heat is always readable without color. A "less animation" option and `prefers-reduced-motion` are respected.
