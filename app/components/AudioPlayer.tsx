"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Pause } from "lucide-react";

interface AudioPlayerProps {
  src: string;
}

/**
 * Most clips here are a second or two long, where "0:00 / 0:00" says nothing,
 * so short audio is shown in tenths of a second ("0.4 / 0.8s").
 */
const formatTime = (time: number, short: boolean) => {
  if (!Number.isFinite(time) || time < 0) time = 0;
  if (short) return time.toFixed(1);
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

/**
 * Minimal inline player: play/pause, a thin seekable progress bar and the time.
 * Give it `key={src}` so its state resets when the audio changes.
 */
export default function AudioPlayer({ src }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // timeupdate only fires a few times a second, which looks jerky on short
  // clips — follow the playhead every frame while playing instead.
  useEffect(() => {
    if (!isPlaying) return;
    let frame: number;
    const tick = () => {
      if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isPlaying]);

  const hasDuration = Number.isFinite(duration) && duration > 0;
  const short = hasDuration && duration < 10;
  const progress = hasDuration ? Math.min(1, currentTime / duration) : 0;

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play().catch(() => setIsPlaying(false));
    } else {
      audio.pause();
    }
  };

  const seekTo = (time: number) => {
    const audio = audioRef.current;
    if (!audio || !hasDuration) return;
    const clamped = Math.max(0, Math.min(duration, time));
    audio.currentTime = clamped;
    setCurrentTime(clamped);
  };

  const seekFromPointer = (clientX: number) => {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    seekTo(((clientX - rect.left) / rect.width) * duration);
  };

  return (
    <div className="flex-1 min-w-0 flex items-center gap-3">
      <button
        type="button"
        onClick={togglePlay}
        aria-label={isPlaying ? "Pause" : "Play"}
        className="shrink-0 size-9 rounded-full bg-zinc-900 text-white flex items-center justify-center hover:bg-zinc-700 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300/60"
      >
        {isPlaying ? (
          <Pause className="size-4 fill-current" />
        ) : (
          <Play className="size-4 fill-current ml-0.5" />
        )}
      </button>

      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={hasDuration ? Math.round(duration * 10) / 10 : 0}
        aria-valuenow={Math.round(currentTime * 10) / 10}
        aria-valuetext={`${currentTime.toFixed(1)} of ${hasDuration ? duration.toFixed(1) : 0} seconds`}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          seekFromPointer(e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.buttons === 1) seekFromPointer(e.clientX);
        }}
        onKeyDown={(e) => {
          const step = hasDuration ? Math.max(0.1, duration / 20) : 0;
          if (e.key === "ArrowRight") { e.preventDefault(); seekTo(currentTime + step); }
          if (e.key === "ArrowLeft") { e.preventDefault(); seekTo(currentTime - step); }
        }}
        className="group flex-1 min-w-0 h-9 flex items-center cursor-pointer touch-none rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300/60"
      >
        <div className="relative w-full h-1 rounded-full bg-zinc-200">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-zinc-900"
            style={{ width: `${progress * 100}%` }}
          />
          <div
            className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-zinc-900 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity"
            style={{ left: `${progress * 100}%` }}
          />
        </div>
      </div>

      <span className="shrink-0 text-body-sm text-zinc-500 tabular-nums">
        {formatTime(currentTime, short)}
        {hasDuration && ` / ${formatTime(duration, short)}${short ? "s" : ""}`}
      </span>

      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onDurationChange={(e) => setDuration(e.currentTarget.duration)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentTime(0);
        }}
        className="hidden"
      />
    </div>
  );
}
