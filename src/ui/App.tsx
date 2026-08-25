import { useEffect, useState } from 'react';
import { applyAudioSettings } from './audioBus';
import { TopBar } from './components/TopBar';
import { Home } from './screens/Home';
import { Summon } from './screens/Summon';
import { ModeSelect } from './screens/ModeSelect';
import { Story } from './screens/Story';
import { GameScreen } from './screens/GameScreen';
import { Collection } from './screens/Collection';
import { EnemyIndex } from './screens/EnemyIndex';
import { PlayerIntro } from './components/PlayerIntro';
import { useGame } from '../application/gameContext';
import { hasCompletedIntro } from '../application/gameState';
import type { SectionId } from '../domain/levels';

export type Screen = 'home' | 'summon' | 'collection' | 'enemies' | 'modes' | 'story' | 'game';

export function App() {
  const { state, setPlayerProfile, markChapterRead } = useGame();
  const [screen, setScreen] = useState<Screen>('home');
  const [activeLevel, setActiveLevel] = useState<number | null>(null);
  const [storySection, setStorySection] = useState<SectionId | null>(null);
  // Bumped to force a fresh GameScreen mount when retrying a stage.
  const [retryNonce, setRetryNonce] = useState(0);
  // Replay the journal cinematic on demand (read-only review of the adventurer).
  const [showJournal, setShowJournal] = useState(false);

  // Keep the shared audio bus in sync with the persisted volume settings, so
  // sliders in Settings take effect immediately and the saved levels apply on
  // load. The bus itself is created lazily on the first sound.
  useEffect(() => {
    applyAudioSettings(state.audio);
  }, [state.audio]);

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

  // From a battle result, jump straight back to the home screen.
  const goHome = () => {
    setActiveLevel(null);
    setScreen('home');
  };

  // Restart the current stage by remounting GameScreen with a fresh engine.
  const retryLevel = () => setRetryNonce((n) => n + 1);

  // Highlight the "Play" tab across the whole play flow.
  const navActive: Screen = screen === 'story' ? 'modes' : screen;

  // First-launch detection: with no saved adventurer, run the journal intro in
  // place of the normal shell. Completing it commits the profile, which flips
  // this gate and drops the player into the game's normal home screen.
  if (!hasCompletedIntro(state)) {
    return (
      <div className="app">
        <PlayerIntro
          onComplete={(name, sprite, proficiency) => setPlayerProfile(name, sprite, proficiency)}
          readChapters={state.readChapters}
          onChapterRead={markChapterRead}
        />
      </div>
    );
  }

  return (
    <div className="app">
      {screen !== 'game' && <TopBar active={navActive} onNavigate={(s) => (s === 'modes' ? goPlay() : setScreen(s))} />}

      {screen === 'home' && (
        <Home
          onPlay={goPlay}
          onSummon={() => setScreen('summon')}
          onCollection={() => setScreen('collection')}
          onEnemyIndex={() => setScreen('enemies')}
          onJournal={() => setShowJournal(true)}
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
        <GameScreen
          key={`${activeLevel}-${retryNonce}`}
          levelId={activeLevel}
          onExit={exitLevel}
          onHome={goHome}
          onRetry={retryLevel}
        />
      )}

      {/* On-demand replay of the journal cinematic, filled with the saved
          adventurer (review mode — no ID to fill in again). */}
      {showJournal && state.player && (
        <PlayerIntro
          review={{
            name: state.player.name,
            sprite: state.player.sprite,
            proficiency: state.player.proficiency,
          }}
          stagesCleared={state.completedLevels.length}
          readChapters={state.readChapters}
          onChapterRead={markChapterRead}
          onClose={(name, sprite, proficiency) => {
            setPlayerProfile(name, sprite, proficiency);
            setShowJournal(false);
          }}
        />
      )}
    </div>
  );
}
