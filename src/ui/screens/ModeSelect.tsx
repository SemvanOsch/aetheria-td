interface Props {
  onStory: () => void;
}

interface ModeCard {
  id: string;
  name: string;
  icon: string;
  desc: string;
  available: boolean;
}

const MODES: ModeCard[] = [
  { id: 'story', name: 'Story', icon: '📖', desc: 'Battle through the Castle, Forest and Inn.', available: true },
  { id: 'endless', name: 'Endless', icon: '♾️', desc: 'Survive as long as you can. Coming soon.', available: false },
  { id: 'trials', name: 'Trials', icon: '⚔️', desc: 'Curated challenge gauntlets. Coming soon.', available: false },
];

export function ModeSelect({ onStory }: Props) {
  return (
    <main className="screen">
      <div className="section-title">
        ▶ Choose a Mode <small>how do you want to play?</small>
      </div>

      <div className="mode-grid">
        {MODES.map((m) => (
          <button
            key={m.id}
            className={`panel mode-card ${m.available ? '' : 'locked'}`}
            disabled={!m.available}
            onClick={m.available ? onStory : undefined}
          >
            <div className="mode-icon">{m.icon}</div>
            <div className="mode-name">{m.name}</div>
            <div className="mode-desc">{m.desc}</div>
            {!m.available && <div className="mode-soon">🔒 Coming soon</div>}
          </button>
        ))}
      </div>
    </main>
  );
}
