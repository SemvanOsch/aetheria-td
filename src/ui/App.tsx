import { useState } from 'react';
import { TopBar } from './components/TopBar';
import { Home } from './screens/Home';
import { Summon } from './screens/Summon';
import { ModeSelect } from './screens/ModeSelect';
import { Story } from './screens/Story';
import { GameScreen } from './screens/GameScreen';
import { Collection } from './screens/Collection';
import { EnemyIndex } from './screens/EnemyIndex';
import type { SectionId } from '../domain/levels';

export type Screen = 'home' | 'summon' | 'collection' | 'enemies' | 'modes' | 'story' | 'game';

export function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [activeLevel, setActiveLevel] = useState<number | null>(null);
  const [storySection, setStorySection] = useState<SectionId | null>(null);

  // Play always starts at the mode picker (reset any drilled-in section).
  const goPlay = () => {
    setStorySection(null);
    setScreen('modes');
  };

  const startLevel = (levelId: number) => {
    setActiveLevel(levelId);
    setScreen('game');
  };

  // Returning from a battle goes back to the section's level list.
  const exitLevel = () => {
    setActiveLevel(null);
    setScreen('story');
  };

  // Highlight the "Play" tab across the whole play flow.
  const navActive: Screen = screen === 'story' ? 'modes' : screen;

  return (
    <div className="app">
      {screen !== 'game' && <TopBar active={navActive} onNavigate={(s) => (s === 'modes' ? goPlay() : setScreen(s))} />}

      {screen === 'home' && (
        <Home
          onPlay={goPlay}
          onSummon={() => setScreen('summon')}
          onCollection={() => setScreen('collection')}
          onEnemyIndex={() => setScreen('enemies')}
        />
      )}
      {screen === 'summon' && <Summon />}
      {screen === 'collection' && <Collection />}
      {screen === 'enemies' && <EnemyIndex />}
      {screen === 'modes' && <ModeSelect onStory={() => setScreen('story')} />}
      {screen === 'story' && (
        <Story
          section={storySection}
          onSelectSection={setStorySection}
          onBack={() => setStorySection(null)}
          onPlay={startLevel}
        />
      )}
      {screen === 'game' && activeLevel != null && (
        <GameScreen levelId={activeLevel} onExit={exitLevel} />
      )}
    </div>
  );
}
