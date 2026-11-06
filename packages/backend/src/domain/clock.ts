export type Clock = () => Date;

export const systemClock: Clock = () => new Date();

export type StartTimer = (ms: number, onElapsed: () => void) => () => void;

export const systemTimer: StartTimer = (ms, onElapsed) => {
  const timer = setTimeout(onElapsed, ms);
  return () => clearTimeout(timer);
};
