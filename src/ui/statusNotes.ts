import type { IconName } from './components/Icon';

/**
 * One status effect as the journal's Status Effects pages write it up. The
 * names match the foe-inspect panel's debuffs in `GameScreen`. Entries are
 * written generically, with no champion's own strength or duration, since
 * each champion that inflicts an effect may set its own.
 */
export interface StatusNote {
  id: string;
  name: string;
  icon: IconName;
  /** The effect's ink colour (medallion and card glow). */
  color: string;
  /** Short kind line under the name, e.g. "Damage over time". */
  kind: string;
  /** What it does, in a sentence or two. */
  effect: string;
}

const BLEEDING: StatusNote = {
  id: 'bleeding',
  name: 'Bleeding',
  icon: 'blood',
  color: '#b3202c',
  kind: 'Damage over time',
  effect:
    "Every hit that lands opens a wound that deals a share of the champion's damage over the next 3 seconds. " +
    'Wounds stack up to 5 at a time, and each new wound restarts the clock on every wound already open, so a quick blade keeps them all bleeding. A wound cannot be dodged or turned aside by a shield, and a foe that is bleeding cannot regenerate.',
};

const POISONED: StatusNote = {
  id: 'poisoned',
  name: 'Poisoned',
  icon: 'poison',
  color: '#5f9e2a',
  kind: 'Damage over time',
  effect:
    "Every hit that lands adds a stack of poison that eats away a share of the foe's own max health over the next 5 seconds, however hard the hit itself struck, so it bites the biggest foes hardest. Bosses resist most of it, taking only an eighth. " +
    'Stacks add up, to at most 5 at a time, and each new stack restarts the clock on every stack already working. Poison cannot be dodged or turned aside by a shield.',
};

const BRITTLE: StatusNote = {
  id: 'brittle',
  name: 'Brittle',
  icon: 'crack',
  color: '#5b9fd0',
  kind: 'Weakness',
  effect:
    'For a 3 seconds it takes 25% more damage from every source. '
};

/** Every status effect the journal records, in reading order. */
export const STATUS_NOTES: StatusNote[] = [BLEEDING, POISONED, BRITTLE];
