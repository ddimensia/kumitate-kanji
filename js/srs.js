// Spaced repetition via FSRS (ts-fsrs). Cards are stored as plain JSON.

import { fsrs, generatorParameters, createEmptyCard, Rating, State } from '../vendor/ts-fsrs.js';

export { Rating, State };

let scheduler = null;

const minutes = (step) => parseFloat(step) * ({ m: 1, h: 60, d: 1440 }[step.slice(-1)] || 1);

/**
 * firstStep: wait between a lesson and its first review (e.g. '4h').
 * missStep: wait before a missed card comes back (e.g. '1h').
 */
export function configureSrs({ retention = 0.9, maxInterval = 365 * 3, fuzz = true, firstStep = '4h', missStep = '1h' } = {}) {
  // A new card rated Good (the lesson) goes to the last learning step; Again goes to the first.
  const learning = [minutes(missStep) <= minutes(firstStep) ? missStep : firstStep, firstStep];
  scheduler = fsrs(
    generatorParameters({
      request_retention: retention,
      maximum_interval: maxInterval,
      enable_fuzz: fuzz,
      enable_short_term: true,
      learning_steps: learning,
      relearning_steps: [missStep],
    }),
  );
}

function toPlain(card) {
  return {
    ...card,
    due: new Date(card.due).toISOString(),
    last_review: card.last_review ? new Date(card.last_review).toISOString() : null,
  };
}

function toInput(card) {
  const c = { ...card, due: new Date(card.due) };
  if (card.last_review) c.last_review = new Date(card.last_review);
  else delete c.last_review;
  return c;
}

export function newSrsCard(now = new Date()) {
  return toPlain(createEmptyCard(now));
}

export function review(srsCard, rating, now = new Date()) {
  if (!scheduler) configureSrs();
  const { card } = scheduler.next(toInput(srsCard), now, rating);
  return toPlain(card);
}

/** Probability of recalling the card right now (0..1). */
export function retrievability(srsCard, now = new Date()) {
  if (!srsCard || srsCard.state === State.New) return 0;
  if (!scheduler) configureSrs();
  try {
    return scheduler.get_retrievability(toInput(srsCard), now, false);
  } catch {
    return 0;
  }
}

export function formatInterval(ms) {
  const min = ms / 60000;
  if (min < 1) return 'now';
  if (min < 60) return `${Math.round(min)}m`;
  const h = min / 60;
  if (h < 24) return `${Math.round(h)}h`;
  const d = h / 24;
  if (d < 30) return `${Math.round(d)}d`;
  const mo = d / 30.44;
  if (mo < 12) return `${mo < 10 ? mo.toFixed(1).replace(/\.0$/, '') : Math.round(mo)}mo`;
  return `${(d / 365.25).toFixed(1).replace(/\.0$/, '')}y`;
}
