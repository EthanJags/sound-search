"use client";

import { FC, useEffect, useRef, useState, useCallback } from 'react';
import { Play, Download, Pause } from 'lucide-react';

interface RankedSound {
  filename: string;
  similarity: number;
  audioUrl?: string;
  soundPack?: string;
}

interface RankingProps {
  ranked_sounds?: RankedSound[];
}

const Ranking: FC<RankingProps> = ({ ranked_sounds = [] }) => {
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const [isPaused, setIsPaused] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  const playSound = useCallback((index: number) => {
    const sound = ranked_sounds[index];
    if (!sound?.audioUrl) return;

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    const audio = new Audio(sound.audioUrl);
    audioRef.current = audio;
    audio.play();
    audio.onended = () => {
      if (activeIndex === index) setActiveIndex(-1);
    };
  }, [ranked_sounds, activeIndex]);

  const stopSound = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsPaused(false);
  }, []);

  const toggleSound = useCallback((index: number) => {
    if (activeIndex === index) {
      if (isPaused) {
        audioRef.current?.play();
        setIsPaused(false);
      } else {
        audioRef.current?.pause();
        setIsPaused(true);
      }
    } else {
      stopSound();
      setActiveIndex(index);
      setIsPaused(false);
      playSound(index);
    }
  }, [activeIndex, isPaused, playSound, stopSound]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!ranked_sounds.length) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = activeIndex < ranked_sounds.length - 1 ? activeIndex + 1 : 0;
        setActiveIndex(next);
        playSound(next);
        itemRefs.current[next]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = activeIndex > 0 ? activeIndex - 1 : ranked_sounds.length - 1;
        setActiveIndex(prev);
        playSound(prev);
        itemRefs.current[prev]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else if (e.key === ' ') {
        e.preventDefault();
        if (activeIndex >= 0) {
          toggleSound(activeIndex);
        } else if (ranked_sounds.length > 0) {
          toggleSound(0);
        }
      } else if (e.key === 'Escape') {
        stopSound();
        setActiveIndex(-1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeIndex, ranked_sounds, playSound, stopSound]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Reset active index when sounds change
  useEffect(() => {
    stopSound();
    setActiveIndex(-1);
  }, [ranked_sounds, stopSound]);

  if (!ranked_sounds.length) return null;

  return (
    <div className="w-full" ref={containerRef}>
      <p className="text-caption text-zinc-400 px-4 mb-2 -mt-1">
        Use <kbd className="px-1.5 py-0.5 rounded bg-zinc-200 text-zinc-500 text-[11px] font-mono">↑</kbd> <kbd className="px-1.5 py-0.5 rounded bg-zinc-200 text-zinc-500 text-[11px] font-mono">↓</kbd> to navigate and auto-play
      </p>
      <div>
        {ranked_sounds.map((sound, index) => (
          <div
            key={sound.filename}
            ref={(el) => { itemRefs.current[index] = el; }}
            onClick={() => toggleSound(index)}
            className={`group cursor-pointer flex items-center gap-4 px-4 py-3 rounded-lg transition-colors ${
              activeIndex === index
                ? 'bg-zinc-100 ring-1 ring-zinc-200'
                : 'hover:bg-zinc-50'
            }`}
          >
            <span className="text-body-sm text-zinc-400 w-5 text-right tabular-nums flex-shrink-0">
              {index + 1}
            </span>

            {sound.audioUrl && (
              <button
                onClick={(e) => { e.stopPropagation(); toggleSound(index); }}
                className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-full bg-primary text-primary-foreground hover:scale-[1.06] active:scale-[0.95] transition-transform"
              >
                {activeIndex === index && !isPaused ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
              </button>
            )}

            <div className="min-w-0 flex-1">
              <span className="text-body font-bold text-zinc-950 truncate block" title={sound.filename}>
                {sound.filename}
              </span>
              {sound.soundPack && (
                <span className="text-caption text-zinc-400 truncate block">
                  {sound.soundPack}
                </span>
              )}
            </div>

            <span className="text-body-sm text-zinc-400 tabular-nums flex-shrink-0">
              {(sound.similarity * 100).toFixed(1)}%
            </span>

            {sound.audioUrl && (
              <a
                href={sound.audioUrl}
                download={sound.filename}
                onClick={(e) => e.stopPropagation()}
                className="flex-shrink-0 text-zinc-300 hover:text-zinc-600 transition-colors"
              >
                <Download size={18} />
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default Ranking;
