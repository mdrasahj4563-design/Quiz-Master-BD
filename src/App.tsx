import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Award,
  Check,
  CheckCircle2,
  ChevronLeft,
  Coins,
  Crown,
  Edit3,
  Play,
  RotateCcw,
  Sparkles,
  Trophy,
  Tv,
  Volume2,
  VolumeX,
  XCircle,
} from 'lucide-react';
import {
  BENGALI_OPTION_LABELS,
  LeaderboardEntry,
  QUESTIONS,
  QuizQuestion,
  SEED_LEADERBOARD,
  toBengaliDigits,
} from './data/questions';
import { playTone, triggerHaptic } from './utils/audio';

type GameState = 'TITLE_MENU' | 'PLAYING' | 'GAME_OVER' | 'VICTORY' | 'LEADERBOARD';
type LeaderboardSort = 'coins' | 'streak';

const HERO_BACKDROP_SRC = '/src/assets/images/quiz_bd_hero_backdrop_1795079422793.jpg';
const TROPHY_EMBLEM_SRC = '/src/assets/images/quiz_bd_emblem_trophy_1795079422050.jpg';

const STORAGE_KEYS = {
  COINS: 'qmbd_total_coins_v1',
  BEST_STREAK: 'qmbd_best_streak_v1',
  PLAYER_NAME: 'qmbd_player_name_v1',
  MUTED: 'qmbd_muted_v1',
};

function shuffleQuestions(list: QuizQuestion[]): QuizQuestion[] {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function getInitialTelegramName(): string {
  try {
    const tgUser = (window as unknown as {
      Telegram?: {
        WebApp?: {
          initDataUnsafe?: {
            user?: { first_name?: string; last_name?: string };
          };
        };
      };
    }).Telegram?.WebApp?.initDataUnsafe?.user;
    if (tgUser?.first_name) {
      return [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ').trim();
    }
  } catch {
    // Ignore outside Telegram environment
  }
  return 'আপনি (খেলোয়াড়)';
}

export default function App() {
  const [gameState, setGameState] = useState<GameState>('TITLE_MENU');

  // Persistent player stats
  const [totalCoins, setTotalCoins] = useState<number>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.COINS);
    const parsed = saved ? parseInt(saved, 10) : 0;
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  });

  const [bestStreak, setBestStreak] = useState<number>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.BEST_STREAK);
    const parsed = saved ? parseInt(saved, 10) : 0;
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  });

  const [playerName, setPlayerName] = useState<string>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.PLAYER_NAME);
    return saved && saved.trim() ? saved.trim() : getInitialTelegramName();
  });

  const [muted, setMuted] = useState<boolean>(() => {
    return localStorage.getItem(STORAGE_KEYS.MUTED) === 'true';
  });

  // Active quiz run state
  const [deck, setDeck] = useState<QuizQuestion[]>(() => shuffleQuestions(QUESTIONS));
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [runCoins, setRunCoins] = useState<number>(0);
  const [runCorrect, setRunCorrect] = useState<number>(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [answerOutcome, setAnswerOutcome] = useState<'idle' | 'correct' | 'wrong'>('idle');
  const [coinPopKey, setCoinPopKey] = useState<number>(0);
  const [continuesUsed, setContinuesUsed] = useState<number>(0);

  // Rewarded Ad simulation modal state
  const [adActive, setAdActive] = useState<boolean>(false);
  const [adSecondsLeft, setAdSecondsLeft] = useState<number>(5);

  // Leaderboard & name editor UI state
  const [leaderboardSort, setLeaderboardSort] = useState<LeaderboardSort>('coins');
  const [editingName, setEditingName] = useState<boolean>(false);
  const [nameDraft, setNameDraft] = useState<string>(playerName);

  // Image error resilience
  const [backdropError, setBackdropError] = useState<boolean>(false);
  const [trophyError, setTrophyError] = useState<boolean>(false);

  const transitionTimerRef = useRef<number | null>(null);

  // Notify Telegram Mini App shell if running inside Telegram
  useEffect(() => {
    try {
      const tg = (window as unknown as {
        Telegram?: {
          WebApp?: {
            ready?: () => void;
            expand?: () => void;
            setHeaderColor?: (color: string) => void;
            setBackgroundColor?: (color: string) => void;
          };
        };
      }).Telegram?.WebApp;
      if (tg) {
        tg.ready?.();
        tg.expand?.();
        tg.setHeaderColor?.('#064E3B');
        tg.setBackgroundColor?.('#064E3B');
      }
    } catch {
      // Safe fallback outside Telegram
    }
  }, []);

  // Sync persistent state
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.COINS, String(totalCoins));
  }, [totalCoins]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.BEST_STREAK, String(bestStreak));
  }, [bestStreak]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.PLAYER_NAME, playerName);
  }, [playerName]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.MUTED, String(muted));
  }, [muted]);

  // Clear pending timers on unmount
  useEffect(() => {
    return () => {
      if (transitionTimerRef.current !== null) {
        window.clearTimeout(transitionTimerRef.current);
      }
    };
  }, []);

  // Rewarded Ad countdown timer
  useEffect(() => {
    if (!adActive) return;
    if (adSecondsLeft <= 0) return;
    const id = window.setTimeout(() => {
      setAdSecondsLeft((prev) => prev - 1);
    }, 1000);
    return () => window.clearTimeout(id);
  }, [adActive, adSecondsLeft]);

  const currentQuestion = deck[currentIndex];

  const clearPendingTimer = useCallback(() => {
    if (transitionTimerRef.current !== null) {
      window.clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
    }
  }, []);

  const startNewGame = useCallback(() => {
    clearPendingTimer();
    playTone('click', muted);
    triggerHaptic('light');
    setDeck(shuffleQuestions(QUESTIONS));
    setCurrentIndex(0);
    setRunCoins(0);
    setRunCorrect(0);
    setContinuesUsed(0);
    setSelectedOption(null);
    setAnswerOutcome('idle');
    setGameState('PLAYING');
  }, [clearPendingTimer, muted]);

  const handleSelectOption = useCallback(
    (optionIndex: number) => {
      if (gameState !== 'PLAYING' || selectedOption !== null || !currentQuestion) return;

      setSelectedOption(optionIndex);
      const isCorrect = optionIndex === currentQuestion.correctIndex;

      if (isCorrect) {
        setAnswerOutcome('correct');
        playTone('correct', muted);
        triggerHaptic('success');

        const nextCorrect = runCorrect + 1;
        setRunCorrect(nextCorrect);
        setRunCoins((prev) => prev + 10);
        setTotalCoins((prev) => prev + 10);
        setCoinPopKey((prev) => prev + 1);
        setBestStreak((prev) => Math.max(prev, nextCorrect));

        transitionTimerRef.current = window.setTimeout(() => {
          setSelectedOption(null);
          setAnswerOutcome('idle');
          if (currentIndex + 1 >= deck.length) {
            playTone('victory', muted);
            setGameState('VICTORY');
          } else {
            setCurrentIndex((prev) => prev + 1);
          }
        }, 720);
      } else {
        setAnswerOutcome('wrong');
        playTone('wrong', muted);
        triggerHaptic('error');

        transitionTimerRef.current = window.setTimeout(() => {
          setGameState('GAME_OVER');
        }, 900);
      }
    },
    [currentIndex, currentQuestion, deck.length, gameState, muted, runCorrect, selectedOption]
  );

  const handleOpenRewardAd = useCallback(() => {
    playTone('click', muted);
    triggerHaptic('light');
    setAdSecondsLeft(5);
    setAdActive(true);
  }, [muted]);

  const handleClaimAdContinue = useCallback(() => {
    if (adSecondsLeft > 0) return;
    playTone('reward', muted);
    triggerHaptic('success');
    setAdActive(false);
    setContinuesUsed((prev) => prev + 1);
    setSelectedOption(null);
    setAnswerOutcome('idle');

    // Move to next question cleanly so player continues forward without repeating the failed one
    if (currentIndex + 1 >= deck.length) {
      setGameState('VICTORY');
    } else {
      setCurrentIndex((prev) => prev + 1);
      setGameState('PLAYING');
    }
  }, [adSecondsLeft, currentIndex, deck.length, muted]);

  const handleSaveName = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      const trimmed = nameDraft.trim();
      if (trimmed) {
        setPlayerName(trimmed.slice(0, 28));
      } else {
        setNameDraft(playerName);
      }
      setEditingName(false);
      playTone('click', muted);
    },
    [muted, nameDraft, playerName]
  );

  // Keyboard shortcuts for desktop/web playability
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (editingName || adActive) return;

      if (gameState === 'TITLE_MENU') {
        if (e.key === 'Enter' || e.key === ' ') {
          const activeTag = document.activeElement?.tagName;
          if (activeTag !== 'BUTTON' && activeTag !== 'INPUT') {
            e.preventDefault();
            startNewGame();
          }
        }
        return;
      }

      if (gameState === 'PLAYING') {
        if (e.key === '1' || e.key === '2' || e.key === '3' || e.key === '4') {
          e.preventDefault();
          handleSelectOption(Number(e.key) - 1);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          clearPendingTimer();
          setGameState('TITLE_MENU');
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [adActive, clearPendingTimer, editingName, gameState, handleSelectOption, startNewGame]);

  // Live ranked leaderboard combining seed players + current player
  const rankedLeaderboard = useMemo(() => {
    const all: LeaderboardEntry[] = [
      ...SEED_LEADERBOARD,
      {
        id: 'current-player',
        name: playerName,
        totalCoins,
        bestStreak,
        isPlayer: true,
      },
    ];

    all.sort((a, b) => {
      if (leaderboardSort === 'coins') {
        return b.totalCoins - a.totalCoins || b.bestStreak - a.bestStreak;
      }
      return b.bestStreak - a.bestStreak || b.totalCoins - a.totalCoins;
    });

    return all;
  }, [bestStreak, leaderboardSort, playerName, totalCoins]);

  const playerRank = useMemo(() => {
    const idx = rankedLeaderboard.findIndex((entry) => entry.isPlayer);
    return idx >= 0 ? idx + 1 : 1;
  }, [rankedLeaderboard]);

  const toggleMute = () => {
    setMuted((prev) => !prev);
  };

  return (
    <div className="relative min-h-[100dvh] w-full overflow-x-hidden bg-[#064E3B] flex items-center justify-center sm:p-4 md:p-6">
      {/* Desktop atmospheric Jamdani & Shapla backdrop (hidden on full-screen mobile) */}
      <div className="pointer-events-none fixed inset-0 hidden sm:block overflow-hidden" aria-hidden="true">
        {!backdropError ? (
          <img
            src={HERO_BACKDROP_SRC}
            alt=""
            referrerPolicy="no-referrer"
            onError={() => setBackdropError(true)}
            className="h-full w-full object-cover opacity-35"
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-b from-[#04392B]/80 via-[#064E3B]/70 to-[#022C22]/90" />
      </div>

      {/* Telegram Mini App Shell (Full 100dvh on mobile, grounded card on desktop) */}
      <main className="relative z-10 flex w-full min-h-[100dvh] sm:min-h-[680px] sm:max-h-[860px] sm:max-w-[460px] flex-col bg-[#F5FAF7] sm:rounded-[28px] sm:shadow-2xl sm:border sm:border-emerald-700/20 overflow-hidden">
        {/* Top HUD Header */}
        <header className="relative z-20 flex items-center justify-between gap-2 bg-[#065F46] px-4 py-3 text-white shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {gameState !== 'TITLE_MENU' ? (
              <button
                type="button"
                onClick={() => {
                  clearPendingTimer();
                  playTone('click', muted);
                  setGameState('TITLE_MENU');
                }}
                aria-label="হোম স্ক্রিনে ফিরুন"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-800/70 text-white hover:bg-emerald-700 active:scale-95 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white shrink-0"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 shrink-0" aria-hidden="true">
                {/* Bespoke Shapla / Quiz Emblem SVG */}
                <svg viewBox="0 0 32 32" className="h-5 w-5 text-white" fill="none">
                  <path
                    d="M16 5C13.5 9.5 13 14 16 18C19 14 18.5 9.5 16 5Z"
                    fill="currentColor"
                  />
                  <path
                    d="M8.5 10C9.2 14.2 11.4 17.2 15.2 18.5C14.2 14.5 12 11.4 8.5 10Z"
                    fill="currentColor"
                    fillOpacity="0.82"
                  />
                  <path
                    d="M23.5 10C22.8 14.2 20.6 17.2 16.8 18.5C17.8 14.5 20 11.4 23.5 10Z"
                    fill="currentColor"
                    fillOpacity="0.82"
                  />
                  <path
                    d="M6 21.5C9.5 23.5 12.8 24.2 16 24.2C19.2 24.2 22.5 23.5 26 21.5"
                    stroke="#FCD34D"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
            )}
            <div className="min-w-0">
              <span className="block truncate text-base font-bold tracking-tight whitespace-nowrap">
                Quiz Master BD
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Coin Balance Readout */}
            <div className="relative flex items-center gap-1.5 rounded-xl bg-emerald-900/60 px-3 py-1.5 border border-emerald-400/25">
              <Coins className="h-4 w-4 text-amber-300 shrink-0" />
              <span className="font-mono-tabular text-sm font-bold text-white whitespace-nowrap">
                {toBengaliDigits(totalCoins)}
              </span>
              {coinPopKey > 0 && gameState === 'PLAYING' && answerOutcome === 'correct' && (
                <span
                  key={coinPopKey}
                  className="animate-float-coin pointer-events-none absolute -bottom-5 right-1 font-mono-tabular text-xs font-bold text-emerald-700 bg-amber-300 px-1.5 py-0.5 rounded shadow-sm"
                >
                  +১০
                </span>
              )}
            </div>

            {/* Audio Mute Toggle */}
            <button
              type="button"
              onClick={toggleMute}
              aria-label={muted ? 'সাউন্ড চালু করুন' : 'সাউন্ড বন্ধ করুন'}
              title={muted ? 'সাউন্ড চালু করুন' : 'সাউন্ড বন্ধ করুন'}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-800/70 text-white hover:bg-emerald-700 active:scale-95 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white shrink-0"
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
          </div>
        </header>

        {/* ========================= TITLE / HOME SCREEN ========================= */}
        {gameState === 'TITLE_MENU' && (
          <div className="flex flex-1 flex-col justify-between overflow-y-auto">
            {/* Hero Key-Art Banner */}
            <div className="relative overflow-hidden bg-gradient-to-br from-[#065F46] via-[#047857] to-[#064E3B] px-6 pt-6 pb-8 text-white">
              {!backdropError ? (
                <img
                  src={HERO_BACKDROP_SRC}
                  alt="বাংলাদেশ কুইজ মাস্টার ব্যাকড্রপ"
                  referrerPolicy="no-referrer"
                  onError={() => setBackdropError(true)}
                  className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-25"
                />
              ) : null}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#064E3B] via-[#065F46]/65 to-transparent" />

              <div className="relative z-10 flex flex-col items-center text-center">
                {/* Trophy Medallion Art */}
                <div className="mb-4 h-24 w-24 rounded-full overflow-hidden border-2 border-amber-300/60 shadow-lg bg-[#064E3B] flex items-center justify-center">
                  {!trophyError ? (
                    <img
                      src={TROPHY_EMBLEM_SRC}
                      alt="কুইজ মাস্টার ট্রফি"
                      referrerPolicy="no-referrer"
                      onError={() => setTrophyError(true)}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Trophy className="h-11 w-11 text-amber-300" />
                  )}
                </div>

                {/* Bespoke Inline SVG Title Lockup */}
                <svg
                  viewBox="0 0 320 56"
                  className="w-full max-w-[280px] h-auto mb-1.5"
                  role="img"
                  aria-label="কুইজ মাস্টার বিডি"
                >
                  <text
                    x="160"
                    y="32"
                    textAnchor="middle"
                    fill="#FFFFFF"
                    fontSize="26"
                    fontWeight="700"
                    fontFamily="'Hind Siliguri', sans-serif"
                  >
                    কুইজ মাস্টার বিডি
                  </text>
                  <line x1="76" y1="45" x2="128" y2="45" stroke="#6EE7B7" strokeWidth="1.5" strokeLinecap="round" />
                  <circle cx="160" cy="45" r="3" fill="#FCD34D" />
                  <line x1="192" y1="45" x2="244" y2="45" stroke="#6EE7B7" strokeWidth="1.5" strokeLinecap="round" />
                </svg>

                <p className="text-sm text-emerald-100/95 max-w-[30ch] leading-relaxed">
                  বাংলা সাধারণ জ্ঞানের ৫০টি চ্যালেঞ্জিং প্রশ্ন
                </p>
              </div>
            </div>

            {/* White Surface Controls & Player Card */}
            <div className="flex flex-1 flex-col justify-between bg-white px-5 py-6">
              <div className="space-y-5">
                {/* Player Identity & Best Record Strip (Clean unboxed dividers, zero nested boxes) */}
                <div className="flex items-center justify-between border-b border-emerald-900/10 pb-4">
                  <div className="min-w-0 flex-1 pr-3">
                    <span className="block text-xs text-slate-500">খেলোয়াড়ের নাম</span>
                    {editingName ? (
                      <form onSubmit={handleSaveName} className="mt-1 flex items-center gap-2">
                        <input
                          type="text"
                          value={nameDraft}
                          onChange={(e) => setNameDraft(e.target.value)}
                          maxLength={28}
                          autoFocus
                          aria-label="আপনার নাম লিখুন"
                          className="w-full min-w-0 rounded-lg border border-emerald-600 bg-emerald-50/40 px-2.5 py-1.5 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                        <button
                          type="submit"
                          aria-label="নাম সংরক্ষণ করুন"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 shrink-0"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                      </form>
                    ) : (
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <span className="truncate text-base font-bold text-slate-900">{playerName}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setNameDraft(playerName);
                            setEditingName(true);
                          }}
                          aria-label="নাম পরিবর্তন করুন"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-emerald-50 hover:text-emerald-700 shrink-0"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="text-right shrink-0">
                    <span className="block text-xs text-slate-500">সর্বোচ্চ ধারা</span>
                    <span className="font-mono-tabular text-lg font-bold text-emerald-700">
                      {toBengaliDigits(bestStreak)}/{toBengaliDigits(QUESTIONS.length)}
                    </span>
                  </div>
                </div>

                {/* Clean 3-Stat Overview Row */}
                <div className="grid grid-cols-3 divide-x divide-emerald-900/10 text-center py-1">
                  <div className="px-2">
                    <span className="block text-xs text-slate-500">মোট প্রশ্ন</span>
                    <span className="mt-0.5 block font-mono-tabular text-xl font-bold text-slate-900">
                      {toBengaliDigits(QUESTIONS.length)}
                    </span>
                  </div>
                  <div className="px-2">
                    <span className="block text-xs text-slate-500">সঠিক উত্তরে</span>
                    <span className="mt-0.5 block font-mono-tabular text-xl font-bold text-emerald-700">
                      +১০ কয়েন
                    </span>
                  </div>
                  <div className="px-2">
                    <span className="block text-xs text-slate-500">র‍্যাংকিং</span>
                    <span className="mt-0.5 block font-mono-tabular text-xl font-bold text-amber-600">
                      #{toBengaliDigits(playerRank)}
                    </span>
                  </div>
                </div>

                {/* Clean Rule Line (Zero Pill Boxes) */}
                <p className="text-center text-sm text-slate-600 leading-relaxed">
                  প্রতিটি সঠিক উত্তরে <strong className="font-semibold text-emerald-700">+১০ কয়েন</strong> পাবেন · ভুল উত্তর দিলে খেলা শেষ হবে।
                </p>
              </div>

              {/* Primary CTAs */}
              <div className="mt-6 space-y-3">
                <button
                  type="button"
                  onClick={startNewGame}
                  className="flex min-h-[54px] w-full items-center justify-center gap-2.5 rounded-2xl bg-emerald-600 px-6 py-3.5 text-lg font-bold text-white shadow-sm hover:bg-emerald-700 active:scale-[0.99] transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 whitespace-nowrap"
                >
                  <Play className="h-5 w-5 fill-current shrink-0" />
                  <span>খেলা শুরু করুন</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    playTone('click', muted);
                    triggerHaptic('light');
                    setGameState('LEADERBOARD');
                  }}
                  className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl border border-emerald-700/20 bg-emerald-50/70 px-6 py-3 text-base font-semibold text-emerald-900 hover:bg-emerald-100/70 active:scale-[0.99] transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 whitespace-nowrap"
                >
                  <Trophy className="h-5 w-5 text-emerald-700 shrink-0" />
                  <span>লিডারবোর্ড</span>
                </button>

                {/* Single flat control-hint line */}
                <p className="pt-1 text-center text-xs text-slate-400">
                  উত্তর দিতে অপশন ট্যাপ করুন বা ১–৪ চাপুন · স্পেস দিয়ে শুরু
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ========================= ACTIVE PLAYING VIEW ========================= */}
        {gameState === 'PLAYING' && currentQuestion && (
          <div className="flex flex-1 flex-col bg-[#F5FAF7]">
            {/* Hairline Progress Bar */}
            <div className="h-1.5 w-full bg-emerald-100 shrink-0" role="progressbar" aria-valuenow={currentIndex + 1} aria-valuemin={1} aria-valuemax={deck.length}>
              <div
                className="h-full bg-emerald-600 transition-all duration-200 ease-out"
                style={{ width: `${((currentIndex + 1) / deck.length) * 100}%` }}
              />
            </div>

            {/* Unboxed Question Telemetry Row */}
            <div className="flex items-center justify-between px-5 pt-4 pb-2 text-xs font-medium text-slate-500 shrink-0">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-emerald-800">{currentQuestion.category}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono-tabular">
                  প্রশ্ন {toBengaliDigits(currentIndex + 1)}/{toBengaliDigits(deck.length)}
                </span>
              </div>
              <div className="flex items-center gap-1.5 font-mono-tabular">
                <span>অর্জিত:</span>
                <span className="font-bold text-emerald-700">+{toBengaliDigits(runCoins)} কয়েন</span>
              </div>
            </div>

            {/* Question & Options Arena */}
            <div className="flex flex-1 flex-col justify-between px-5 pb-5 pt-2">
              {/* Crisp White Question Card */}
              <div
                key={currentQuestion.id}
                className="animate-enter-pop rounded-2xl bg-white p-5 sm:p-6 shadow-sm border border-emerald-900/10"
              >
                <h2 className="text-xl sm:text-[22px] font-bold leading-snug text-slate-900 [text-wrap:balance]">
                  {currentQuestion.question}
                </h2>
              </div>

              {/* 4 Answer Options (>= 52px touch targets) */}
              <div className="my-4 space-y-3">
                {currentQuestion.options.map((optionText, idx) => {
                  const isSelected = selectedOption === idx;
                  const isCorrectOption = idx === currentQuestion.correctIndex;
                  const hasAnswered = selectedOption !== null;

                  let buttonStyle =
                    'bg-white border-emerald-900/15 text-slate-900 hover:border-emerald-500 hover:bg-emerald-50/40';
                  let badgeStyle = 'bg-emerald-50 text-emerald-800 border-emerald-200';
                  let statusLabel: string | null = null;

                  if (hasAnswered) {
                    if (isCorrectOption) {
                      buttonStyle = 'bg-emerald-600 border-emerald-600 text-white shadow-sm';
                      badgeStyle = 'bg-white/20 text-white border-white/30';
                      statusLabel = 'সঠিক';
                    } else if (isSelected) {
                      buttonStyle = 'bg-rose-50 border-rose-500 text-rose-900 animate-shake-x';
                      badgeStyle = 'bg-rose-600 text-white border-rose-600';
                      statusLabel = 'ভুল উত্তর';
                    } else {
                      buttonStyle = 'bg-white/60 border-slate-200 text-slate-400 opacity-75';
                      badgeStyle = 'bg-slate-100 text-slate-400 border-slate-200';
                    }
                  }

                  return (
                    <button
                      key={idx}
                      type="button"
                      disabled={hasAnswered}
                      onClick={() => handleSelectOption(idx)}
                      className={`flex min-h-[54px] w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition-transform duration-150 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${buttonStyle}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border text-sm font-bold ${badgeStyle}`}
                        >
                          {BENGALI_OPTION_LABELS[idx]}
                        </span>
                        <span className="text-base font-semibold leading-snug">{optionText}</span>
                      </div>

                      {hasAnswered && isCorrectOption && (
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-xs font-bold">{statusLabel}</span>
                          <CheckCircle2 className="h-5 w-5 text-white shrink-0" />
                        </div>
                      )}

                      {hasAnswered && isSelected && !isCorrectOption && (
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-xs font-bold text-rose-700">{statusLabel}</span>
                          <XCircle className="h-5 w-5 text-rose-600 shrink-0" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Clean bottom hint */}
              <div className="text-center text-xs text-slate-400">
                সঠিক উত্তর +১০ কয়েন · ভুল উত্তরে গেম ওভার
              </div>
            </div>
          </div>
        )}

        {/* ========================= GAME OVER SCREEN ========================= */}
        {gameState === 'GAME_OVER' && (
          <div className="flex flex-1 flex-col justify-between bg-white px-6 py-7 animate-enter-pop">
            <div className="flex flex-col items-center text-center pt-2">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-50 border border-rose-200 text-rose-600">
                <XCircle className="h-9 w-9" />
              </div>

              <h1 className="text-2xl font-bold text-slate-900">গেম ওভার</h1>
              <p className="mt-1.5 text-sm text-slate-600 max-w-[32ch] leading-relaxed">
                দুঃখিত, উত্তরটি সঠিক ছিল না। তবে আপনি এখনই চালিয়ে যেতে অথবা নতুন করে খেলতে পারেন।
              </p>

              {/* Run Summary Strip */}
              <div className="mt-6 grid w-full grid-cols-3 divide-x divide-emerald-900/10 rounded-2xl bg-[#F5FAF7] border border-emerald-900/10 py-4 text-center">
                <div className="px-2">
                  <span className="block text-xs text-slate-500">সঠিক উত্তর</span>
                  <span className="mt-1 block font-mono-tabular text-xl font-bold text-slate-900">
                    {toBengaliDigits(runCorrect)}
                  </span>
                </div>
                <div className="px-2">
                  <span className="block text-xs text-slate-500">অর্জিত কয়েন</span>
                  <span className="mt-1 block font-mono-tabular text-xl font-bold text-emerald-700">
                    +{toBengaliDigits(runCoins)}
                  </span>
                </div>
                <div className="px-2">
                  <span className="block text-xs text-slate-500">সেরা স্কোর</span>
                  <span className="mt-1 block font-mono-tabular text-xl font-bold text-amber-600">
                    {toBengaliDigits(bestStreak)}
                  </span>
                </div>
              </div>

              {currentQuestion && (
                <div className="mt-4 w-full rounded-xl bg-emerald-50/70 border border-emerald-200/70 px-4 py-3 text-left">
                  <span className="block text-xs text-emerald-800">সঠিক উত্তর ছিল:</span>
                  <span className="mt-0.5 block text-sm font-bold text-emerald-950">
                    {BENGALI_OPTION_LABELS[currentQuestion.correctIndex]}.{' '}
                    {currentQuestion.options[currentQuestion.correctIndex]}
                  </span>
                </div>
              )}
            </div>

            {/* Required 2 Primary Game Over Buttons */}
            <div className="mt-6 space-y-3">
              <button
                type="button"
                onClick={handleOpenRewardAd}
                className="flex min-h-[54px] w-full items-center justify-center gap-2.5 rounded-2xl bg-emerald-600 px-5 py-3.5 text-base font-bold text-white shadow-sm hover:bg-emerald-700 active:scale-[0.99] transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 whitespace-nowrap"
              >
                <Tv className="h-5 w-5 shrink-0" />
                <span>বিজ্ঞাপন দেখে চালিয়ে যান</span>
              </button>

              <button
                type="button"
                onClick={startNewGame}
                className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl border border-emerald-700/25 bg-white px-5 py-3.5 text-base font-bold text-emerald-900 hover:bg-emerald-50 active:scale-[0.99] transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 whitespace-nowrap"
              >
                <RotateCcw className="h-5 w-5 text-emerald-700 shrink-0" />
                <span>আবার খেলুন</span>
              </button>

              <div className="flex items-center justify-center gap-6 pt-2 text-sm font-medium text-slate-600">
                <button
                  type="button"
                  onClick={() => {
                    playTone('click', muted);
                    setGameState('LEADERBOARD');
                  }}
                  className="hover:text-emerald-700 underline-offset-4 hover:underline whitespace-nowrap"
                >
                  লিডারবোর্ড
                </button>
                <span aria-hidden="true" className="text-slate-300">·</span>
                <button
                  type="button"
                  onClick={() => {
                    playTone('click', muted);
                    setGameState('TITLE_MENU');
                  }}
                  className="hover:text-emerald-700 underline-offset-4 hover:underline whitespace-nowrap"
                >
                  হোম স্ক্রিন
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================= VICTORY SCREEN (ALL 50 COMPLETED) ========================= */}
        {gameState === 'VICTORY' && (
          <div className="flex flex-1 flex-col justify-between bg-white px-6 py-7 animate-enter-pop">
            <div className="flex flex-col items-center text-center pt-4">
              <div className="mb-4 h-24 w-24 rounded-full overflow-hidden border-2 border-amber-400 shadow-md bg-[#064E3B] flex items-center justify-center">
                {!trophyError ? (
                  <img
                    src={TROPHY_EMBLEM_SRC}
                    alt="বিজয়ী ট্রফি"
                    referrerPolicy="no-referrer"
                    onError={() => setTrophyError(true)}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Crown className="h-11 w-11 text-amber-300" />
                )}
              </div>

              <h1 className="text-2xl font-bold text-emerald-900">অভিনন্দন, কুইজ চ্যাম্পিয়ন!</h1>
              <p className="mt-2 text-sm text-slate-600 max-w-[32ch] leading-relaxed">
                আপনি সবগুলো {toBengaliDigits(QUESTIONS.length)}টি সাধারণ জ্ঞান প্রশ্নের ধাপ সফলভাবে সম্পন্ন করেছেন।
              </p>

              <div className="mt-6 grid w-full grid-cols-3 divide-x divide-emerald-900/10 rounded-2xl bg-[#F5FAF7] border border-emerald-900/10 py-4 text-center">
                <div className="px-2">
                  <span className="block text-xs text-slate-500">সঠিক উত্তর</span>
                  <span className="mt-1 block font-mono-tabular text-xl font-bold text-slate-900">
                    {toBengaliDigits(runCorrect)}
                  </span>
                </div>
                <div className="px-2">
                  <span className="block text-xs text-slate-500">অর্জিত কয়েন</span>
                  <span className="mt-1 block font-mono-tabular text-xl font-bold text-emerald-700">
                    +{toBengaliDigits(runCoins)}
                  </span>
                </div>
                <div className="px-2">
                  <span className="block text-xs text-slate-500">কন্টিনিউ</span>
                  <span className="mt-1 block font-mono-tabular text-xl font-bold text-slate-900">
                    {toBengaliDigits(continuesUsed)}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              <button
                type="button"
                onClick={startNewGame}
                className="flex min-h-[54px] w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3.5 text-base font-bold text-white shadow-sm hover:bg-emerald-700 active:scale-[0.99] transition-all duration-150 whitespace-nowrap"
              >
                <RotateCcw className="h-5 w-5 shrink-0" />
                <span>আবার খেলুন</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  playTone('click', muted);
                  setGameState('LEADERBOARD');
                }}
                className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl border border-emerald-700/20 bg-emerald-50/70 px-5 py-3 text-base font-semibold text-emerald-900 hover:bg-emerald-100/70 whitespace-nowrap"
              >
                <Trophy className="h-5 w-5 text-emerald-700 shrink-0" />
                <span>লিডারবোর্ড দেখুন</span>
              </button>
            </div>
          </div>
        )}

        {/* ========================= LEADERBOARD SCREEN ========================= */}
        {gameState === 'LEADERBOARD' && (
          <div className="flex flex-1 flex-col bg-[#F5FAF7] overflow-hidden animate-enter-pop">
            <div className="bg-white px-5 pt-5 pb-4 border-b border-emerald-900/10 shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-xl font-bold text-slate-900">শীর্ষ খেলোয়াড়দের তালিকা</h1>
                  <p className="text-xs text-slate-500 mt-0.5">
                    আপনার বর্তমান অবস্থান: #{toBengaliDigits(playerRank)} · মোট {toBengaliDigits(totalCoins)} কয়েন
                  </p>
                </div>
                <Award className="h-7 w-7 text-emerald-600 shrink-0" />
              </div>

              {/* Segmented Filter Control */}
              <div className="mt-4 grid grid-cols-2 gap-1 rounded-xl bg-emerald-50 p-1 border border-emerald-900/10">
                <button
                  type="button"
                  onClick={() => {
                    playTone('click', muted);
                    setLeaderboardSort('coins');
                  }}
                  className={`rounded-lg py-2 text-xs font-bold transition-colors whitespace-nowrap ${
                    leaderboardSort === 'coins'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-emerald-900 hover:bg-emerald-100/60'
                  }`}
                >
                  মোট কয়েন অনুযায়ী
                </button>
                <button
                  type="button"
                  onClick={() => {
                    playTone('click', muted);
                    setLeaderboardSort('streak');
                  }}
                  className={`rounded-lg py-2 text-xs font-bold transition-colors whitespace-nowrap ${
                    leaderboardSort === 'streak'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-emerald-900 hover:bg-emerald-100/60'
                  }`}
                >
                  সর্বোচ্চ ধারা অনুযায়ী
                </button>
              </div>
            </div>

            {/* Leaderboard Rows */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2.5">
              {rankedLeaderboard.map((entry, idx) => {
                const rank = idx + 1;
                const isTopThree = rank <= 3;
                const rankColor =
                  rank === 1
                    ? 'bg-amber-400 text-amber-950'
                    : rank === 2
                    ? 'bg-slate-200 text-slate-800'
                    : rank === 3
                    ? 'bg-amber-700/20 text-amber-900'
                    : 'bg-emerald-50 text-emerald-800';

                return (
                  <div
                    key={entry.id}
                    className={`flex items-center justify-between gap-3 rounded-2xl px-4 py-3 border ${
                      entry.isPlayer
                        ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm'
                        : 'bg-white border-emerald-900/10 text-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl font-mono-tabular text-sm font-bold ${
                          entry.isPlayer ? 'bg-white text-emerald-800' : rankColor
                        }`}
                      >
                        {toBengaliDigits(rank)}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-bold">
                            {entry.name}
                          </span>
                          {isTopThree && !entry.isPlayer && rank === 1 && (
                            <Crown className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                          )}
                        </div>
                        <span
                          className={`block text-xs ${
                            entry.isPlayer ? 'text-emerald-100' : 'text-slate-500'
                          }`}
                        >
                          সেরা ধারা: {toBengaliDigits(entry.bestStreak)} প্রশ্ন
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 font-mono-tabular">
                      <Coins
                        className={`h-4 w-4 ${
                          entry.isPlayer ? 'text-amber-300' : 'text-amber-500'
                        }`}
                      />
                      <span className="text-sm font-bold">{toBengaliDigits(entry.totalCoins)}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="bg-white px-5 py-4 border-t border-emerald-900/10 shrink-0">
              <button
                type="button"
                onClick={startNewGame}
                className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-base font-bold text-white hover:bg-emerald-700 active:scale-[0.99] transition-all duration-150 whitespace-nowrap"
              >
                <Play className="h-4 w-4 fill-current shrink-0" />
                <span>এখনই খেলুন</span>
              </button>
            </div>
          </div>
        )}

        {/* ========================= REWARDED AD MODAL ========================= */}
        {adActive && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-emerald-950/85 p-5"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reward-ad-title"
          >
            <div className="animate-enter-pop w-full max-w-[380px] rounded-3xl bg-white p-6 text-center shadow-2xl border border-emerald-900/10">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-200">
                <Sparkles className="h-8 w-8" />
              </div>

              <h2 id="reward-ad-title" className="text-xl font-bold text-slate-900">
                রিওয়ার্ড বিজ্ঞাপন চলছে
              </h2>
              <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
                বিজ্ঞাপন শেষ হলে আপনার বর্তমান স্কোর ও কয়েনসহ খেলা চালিয়ে যেতে পারবেন।
              </p>

              {/* Countdown Timer Ring */}
              <div className="my-6 flex flex-col items-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-emerald-600 bg-emerald-50 font-mono-tabular text-3xl font-bold text-emerald-800">
                  {toBengaliDigits(adSecondsLeft)}
                </div>
                <span className="mt-2 text-xs text-slate-500">
                  {adSecondsLeft > 0 ? 'দয়া করে অপেক্ষা করুন...' : 'রিওয়ার্ড প্রস্তুত!'}
                </span>
              </div>

              <div className="space-y-2.5">
                <button
                  type="button"
                  disabled={adSecondsLeft > 0}
                  onClick={handleClaimAdContinue}
                  className={`flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl px-5 py-3 text-base font-bold transition-all duration-150 whitespace-nowrap ${
                    adSecondsLeft > 0
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm'
                  }`}
                >
                  <Play className="h-4 w-4 fill-current shrink-0" />
                  <span>খেলা চালিয়ে যান</span>
                </button>

                <button
                  type="button"
                  onClick={() => setAdActive(false)}
                  className="w-full py-2 text-xs font-medium text-slate-500 hover:text-slate-700"
                >
                  বাতিল করুন
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
