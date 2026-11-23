// Japanese text-to-speech with the browser's own voices (Web Speech API).
// Always given kana, so the voice can't guess the wrong reading of a kanji.

import { getSettings } from './state.js';

let voices = [];
const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;

function loadVoices() {
  if (!synth) return;
  voices = synth.getVoices().filter((v) => /^ja(-|_|$)/i.test(v.lang));
}
if (synth) {
  loadVoices();
  synth.addEventListener?.('voiceschanged', loadVoices);
}

export const speechAvailable = () => !!synth && voices.length > 0;
export const japaneseVoices = () => voices.map((v) => v.name);

// Natural-sounding voices first, where the platform has them.
const PREFERRED = [/natural/i, /google/i, /kyoko/i, /o-ren/i, /nanami/i, /haruka/i, /otoya/i, /ayumi/i];

function pickVoice() {
  const want = getSettings().voice;
  if (want) {
    const v = voices.find((x) => x.name === want);
    if (v) return v;
  }
  for (const re of PREFERRED) {
    const v = voices.find((x) => re.test(x.name));
    if (v) return v;
  }
  return voices[0] || null;
}

export function speak(kana) {
  if (!synth || !kana) return false;
  if (!voices.length) loadVoices();
  synth.cancel();
  const u = new SpeechSynthesisUtterance(kana);
  u.lang = 'ja-JP';
  const v = pickVoice();
  if (v) u.voice = v;
  u.rate = getSettings().rate || 0.9;
  synth.speak(u);
  return true;
}

/** Make any [data-say] element inside `root` speak its text when clicked. */
export function wireSpeech(root) {
  root.addEventListener('click', (e) => {
    const el = e.target.closest('[data-say]');
    if (el && root.contains(el)) {
      e.preventDefault();
      speak(el.dataset.say);
    }
  });
}

export const speakerButton = (kana, label = 'Play audio') =>
  `<button type="button" class="speak" data-say="${kana.replace(/"/g, '')}" aria-label="${label}" title="${label}">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
  </button>`;
