import { Icon, type IconName } from '../components/Icon';

interface Props {
  onStory: () => void;
  /** Back to the home desk. */
  onBack: () => void;
}

interface ModeCard {
  id: string;
  name: string;
  icon: IconName;
  desc: string;
  available: boolean;
}

const MODES: ModeCard[] = [
  { id: 'story', name: 'Story', icon: 'book', desc: 'Battle through the Castle, Forest and Inn.', available: true },
  { id: 'endless', name: 'Endless', icon: 'endless', desc: 'Survive as long as you can. Coming soon.', available: false },
  { id: 'trials', name: 'Trials', icon: 'trophy', desc: 'Curated challenge gauntlets. Coming soon.', available: false },
];

export function ModeSelect({ onStory, onBack }: Props) {
  return (
    <main className="screen">
      <div className="section-title" style={{ gap: 12 }}>
        <button className="btn ghost sort-toggle" onClick={onBack}>
          <Icon name="back" /> Home
        </button>
        <Icon name="swords" /> Choose a Mode <small>how do you want to play?</small>
      </div>

      <div className="mode-grid">
        {MODES.map((m) => (
          <button
            key={m.id}
            className={`panel mode-card ${m.available ? '' : 'locked'}`}
            disabled={!m.available}
            onClick={m.available ? onStory : undefined}
          >
            <div className="mode-icon">
              <Icon name={m.icon} />
            </div>
            <div className="mode-name">{m.name}</div>
            <div className="mode-desc">{m.desc}</div>
            {!m.available && (
              <div className="mode-soon">
                <Icon name="lock" /> Coming soon
              </div>
            )}
          </button>
        ))}
      </div>
    </main>
  );
}
