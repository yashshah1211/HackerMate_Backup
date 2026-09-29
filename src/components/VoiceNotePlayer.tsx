"use client";

import React, { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";

interface VoiceNotePlayerProps {
  src: string;
  duration?: number; // duration in seconds
  isMine?: boolean;
}

export default function VoiceNotePlayer({ src, duration, isMine }: VoiceNotePlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(duration || 0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio(src);
    audioRef.current = audio;

    audio.onloadedmetadata = () => {
      if (audio.duration && !isNaN(audio.duration)) {
        setTotalDuration(Math.round(audio.duration));
      }
    };

    audio.ontimeupdate = () => {
      setCurrentTime(audio.currentTime);
    };

    audio.onended = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    return () => {
      audio.pause();
      audio.src = "";
    };
  }, [src]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const progressPercent = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;

  return (
    <div className="my-0.5 flex w-[220px] max-w-full select-none items-center gap-3 text-ink-2">
      {/* Play/Pause Button */}
      <button
        type="button"
        onClick={togglePlay}
        aria-label={isPlaying ? "Pause voice note" : "Play voice note"}
        className={cn(
          "inline-flex size-9 shrink-0 items-center justify-center rounded-full text-ink ring-1 ring-inset ring-line-strong transition-colors hover:ring-ink-4 active:scale-95 [&_svg]:size-4",
          isMine ? "bg-canvas" : "bg-raised",
        )}
      >
        {isPlaying ? <Pause aria-hidden /> : <Play className="ml-0.5" aria-hidden />}
      </button>

      {/* Waveform / Progress bar */}
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
        <div className="flex h-4 items-center gap-0.5" aria-hidden>
          {[40, 70, 90, 60, 100, 50, 80, 60, 75, 45, 95, 70, 50, 85, 60].map((h, i) => {
            const barProgress = (i / 15) * 100;
            const isFilled = progressPercent >= barProgress;
            return (
              <div
                key={i}
                style={{ height: `${h}%` }}
                className={cn("w-1 rounded-full transition-colors duration-100", isFilled ? "bg-ink-2" : "bg-line-strong")}
              />
            );
          })}
        </div>

        <div className="flex items-center justify-between font-mono text-[11px] text-ink-3 tabular">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(totalDuration)}</span>
        </div>
      </div>
    </div>
  );
}
