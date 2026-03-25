import { randomInt } from 'node:crypto';

export type RpsMove = 'rock' | 'paper' | 'scissors';

export interface RpsDuelResult {
  you: RpsMove;
  house: RpsMove;
  outcome: 'win' | 'lose' | 'draw';
  headline: string;
  taskHint: string;
}

export interface CoinDuelResult {
  call: 'heads' | 'tails';
  result: 'heads' | 'tails';
  youWin: boolean;
  headline: string;
  taskHint: string;
}

export interface ChamberDuelResult {
  yourChamber: number;
  dangerChamber: number;
  hit: boolean;
  headline: string;
  taskHint: string;
}

const MOVES: RpsMove[] = ['rock', 'paper', 'scissors'];

function beats(a: RpsMove, b: RpsMove): boolean {
  return (
    (a === 'rock' && b === 'scissors') ||
    (a === 'paper' && b === 'rock') ||
    (a === 'scissors' && b === 'paper')
  );
}

/**
 * Rock–paper–scissors vs a fair “house” pick (server RNG). Use for quick channel decisions.
 */
export function playRpsDuel(you: RpsMove): RpsDuelResult {
  const house = MOVES[randomInt(0, 3)] as RpsMove;
  let outcome: RpsDuelResult['outcome'];
  if (you === house) outcome = 'draw';
  else if (beats(you, house)) outcome = 'win';
  else outcome = 'lose';

  const headline =
    outcome === 'win'
      ? 'You win! House takes the chore.'
      : outcome === 'lose'
        ? 'House wins — tag yourself for the next small task.'
        : 'Draw — run it back or flip a coin.';

  const taskHint =
    outcome === 'win'
      ? 'Create a task: “Winner’s choice — House owes a coffee run.”'
      : outcome === 'lose'
        ? 'Create a task: “Lost RPS duel — pick up the next channel follow-up.”'
        : 'Optional: create a task for the rematch.';

  return { you, house, outcome, headline, taskHint };
}

/**
 * Coin call vs server flip — good for binary decisions in a channel.
 */
export function playCoinDuel(call: 'heads' | 'tails'): CoinDuelResult {
  const result: 'heads' | 'tails' = randomInt(0, 2) === 0 ? 'heads' : 'tails';
  const youWin = result === call;
  const headline = youWin ? 'Called it! You earned bragging rights.' : 'Missed — you’re on deck for a fun follow-up.';
  const taskHint = youWin
    ? 'Create a task: “Coin flip win — delegate something tiny.”'
    : 'Create a task: “Lost coin flip — own the next checklist item.”';
  return { call, result, youWin, headline, taskHint };
}

/**
 * “Lucky chamber” — pick 1–6; one random chamber is the silly “loser” slot (confetti / foam dart flavor, not real harm).
 */
export function playChamberDuel(yourChamber: number): ChamberDuelResult {
  const slot = Math.min(6, Math.max(1, Math.floor(yourChamber)));
  const dangerChamber = randomInt(1, 7); // 1..6
  const hit = slot === dangerChamber;
  const headline = hit
    ? 'Foam dart! You’re the channel’s “task hero” this round.'
    : 'Safe click — chamber was clear.';
  const taskHint = hit
    ? 'Create a task: “Chamber duel — splashed! Do one small thing for the team.”'
    : 'No task debt — or create one for whoever chickened out.';
  return { yourChamber: slot, dangerChamber, hit, headline, taskHint };
}
