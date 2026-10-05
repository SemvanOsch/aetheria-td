import { useGame } from '../../application/gameContext';
import { isEndlessUnlocked } from '../../application/gameState';
import { SECTIONS } from '../../domain/levels';
import { Icon, type IconName } from '../components/Icon';

interface Props {
  onStory: () => void;
  onEndless: () => void;
  /** Back to the home desk. */
  onBack: () => void;
}

interface ModeCard {
  id: string;
  name: string;
  icon: IconName;
  desc: string;
  available: boolean;
  /** Why the mode can't be entered yet (shown under a locked card). */
  lockLabel?: string;
  onSelect?: () => void;
}

export function ModeSelect({ onStory, onEndless, onBack }: Props) {
  const { state } = useGame();
  const endlessOpen = SECTIONS.some((s) => isEndlessUnlocked(state, s.id));
  const modes: ModeCard[] = [
    { id: 'story', name: 'Story', icon: 'book', desc: 'Battle through the Castle, Forest and Inn.', available: true, onSelect: onStory },
    {
      id: 'endless',
      name: 'Endless',
      icon: 'endless',
      desc: 'Survive as long as you can against ever-stronger waves.',
      available: endlessOpen,
      lockLabel: 'Clear a chapter to unlock',
      onSelect: onEndless,
    },
    { id: 'trials', name: 'Trials', icon: 'trophy', desc: 'Curated challenge gauntlets. Coming soon.', available: false, lockLabel: 'Coming soon' },
  ];

  return (
    <main className="screen">
      <div className="section-title" style={{ gap: 12 }}>
        <button className="btn ghost sort-toggle" onClick={onBack}>
          <Icon name="back" /> Home
        </button>
        <Icon name="swords" /> Choose a Mode <small>how do you want to play?</small>
      </div>

      <div className="mode-grid">
        {modes.map((m) => (
          <button
            key={m.id}
            className={`panel mode-card ${m.available ? '' : 'locked'}`}
            disabled={!m.available}
            onClick={m.available ? m.onSelect : undefined}
          >
            <div className="mode-icon">
              <Icon name={m.icon} />
            </div>
            <div className="mode-name">{m.name}</div>
            <div className="mode-desc">{m.desc}</div>
            {!m.available && (
              <div className="mode-soon">
                <Icon name="lock" /> {m.lockLabel}
              </div>
            )}
          </button>
        ))}
      </div>
    </main>
  );
}
