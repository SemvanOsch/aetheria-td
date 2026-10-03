import { useEffect, useState } from 'react';
import { applyAudioSettings } from './audioBus';
import { battleTrackFor, setMusicTrack } from './music';
import { TopBar } from './components/TopBar';
import { DeskBackdrop, Home } from './screens/Home';
import { Summon } from './screens/Summon';
import { ModeSelect } from './screens/ModeSelect';
import { Story } from './screens/Story';
import { GameScreen } from './screens/GameScreen';
import { PlayerIntro, type JournalSection } from './components/PlayerIntro';
import { useGame } from '../application/gameContext';
import { hasAffordableMasteryUpgrade, hasCompletedIntro } from '../application/gameState';
import { getLevel, type SectionId } from '../domain/levels';

export type Screen = 'home' | 'summon' | 'modes' | 'story' | 'game';

export function App() {
  const { state, setPlayerProfile, markChapterRead } = useGame();
  const [screen, setScreen] = useState<Screen>('home');
  const [activeLevel, setActiveLevel] = useState<number | null>(null);
  const [storySection, setStorySection] = useState<SectionId | null>(null);
  // Bumped to force a fresh GameScreen mount when retrying a stage.
  const [retryNonce, setRetryNonce] = useState(0);
  // The journal, open on one of its bookmarks: the adventurer's own pages,
  // their champions (and team), or the bestiary. Null while it's closed.
  const [journal, setJournal] = useState<JournalSection | null>(null);
  // Which desk object the player is coming back from, so the home screen can
  // zoom back out from it (the orb after Summon, the map after Play).
  const [homeFrom, setHomeFrom] = useState<'summon' | 'play' | null>(null);
  const goHomeFrom = (from: 'summon' | 'play') => {
    setHomeFrom(from);
    setScreen('home');
  };

  // Keep the shared audio bus in sync with the persisted volume settings, so
  // sliders in Settings take effect immediately and the saved levels apply on
  // load. The bus itself is created lazily on the first sound.
  useEffect(() => {
    applyAudioSettings(state.audio);
  }, [state.audio]);

  // Background music: the menu theme everywhere outside a battle (the journal
  // intro included), the stage's chapter battle theme inside one.
  const battleSection = screen === 'game' && activeLevel != null ? getLevel(activeLevel)?.section : undefined;
  useEffect(() => {
    setMusicTrack(battleSection ? battleTrackFor(battleSection) : 'menu');
  }, [battleSection]);

  // Play always starts at the mode picker (the campaign then opens on the latest chapter).
  const goPlay = () => {
    setStorySection(null);
    setScreen('modes');
  };

  const startLevel = (levelId: number) => {
    setActiveLevel(levelId);
    // Remember the chapter so leaving the battle reopens its map.
    setStorySection(getLevel(levelId)?.section ?? null);
    setScreen('game');
  };

  // Returning from a battle goes back to the chapter's map.
  const exitLevel = () => {
    setActiveLevel(null);
    setScreen('story');
  };

  // From a battle result, jump straight back to the home screen.
  const goHome = () => {
    setActiveLevel(null);
    goHomeFrom('play');
  };

  // Restart the current stage by remounting GameScreen with a fresh engine.
  const retryLevel = () => setRetryNonce((n) => n + 1);

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
      {/* The living night backdrop sits behind every menu (the battle board
          paints its own world, so it's skipped there). */}
      {screen !== 'game' && screen !== 'home' && (
        <DeskBackdrop key={screen === 'summon' ? 'summon' : 'play'} focus={screen === 'summon' ? 'summon' : 'play'} />
      )}
      {screen !== 'game' && <TopBar />}

      {screen === 'home' && (
        <Home
          onPlay={goPlay}
          onContinue={startLevel}
          onSummon={() => setScreen('summon')}
          onJournal={() => setJournal('profile')}
          journalOpen={journal != null}
          returnFrom={homeFrom}
        />
      )}
      {screen === 'summon' && <Summon onBack={() => goHomeFrom('summon')} />}
      {screen === 'modes' && <ModeSelect onStory={() => setScreen('story')} onBack={() => goHomeFrom('play')} />}
      {screen === 'story' && (
        <Story
          section={storySection}
          onSelectSection={setStorySection}
          onPlay={startLevel}
          onEditTeam={() => setJournal('champions')}
          onBack={goPlay}
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

      {/* The journal, filled with the saved adventurer (review mode — no ID to
          fill in again), opened on the bookmark that was asked for. */}
      {journal && state.player && (
        <PlayerIntro
          review={{
            name: state.player.name,
            sprite: state.player.sprite,
            proficiency: state.player.proficiency,
          }}
          initialSection={journal}
          championsMark={
            state.prefs.showMasteryMarks && state.ownedUnits.some((id) => hasAffordableMasteryUpgrade(state, id))
          }
          stagesCleared={state.completedLevels.length}
          readChapters={state.readChapters}
          onChapterRead={markChapterRead}
          onClose={(name, sprite, proficiency) => {
            setPlayerProfile(name, sprite, proficiency);
            setJournal(null);
          }}
        />
      )}
    </div>
  );
}
