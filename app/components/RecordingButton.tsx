"use client";

import { useState, useEffect } from "react";
import { Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface RecordingButtonProps {
  audioBlob: Blob | null;
  setAudioBlob: (blob: Blob | null) => void;
}

export default function RecordingButton({ audioBlob, setAudioBlob }: RecordingButtonProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const getSupportedMimeType = () => {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/ogg'
    ];
    return types.find(type => MediaRecorder.isTypeSupported(type)) || 'audio/webm';
  };

  const playTone = (frequency: number, duration: number, type: 'start' | 'stop') => {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // Set frequency
    oscillator.frequency.value = frequency;
    oscillator.type = 'sine';

    // Configure gain (volume)
    if (type === 'start') {
      gainNode.gain.setValueAtTime(0, audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.1);
      gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + duration);
    } else {
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + duration);
    }

    // Start and stop
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + duration);
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRecording]);

  useEffect(() => {
    if (audioBlob) {
      // Revoke previous URL to prevent memory leaks
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
      // Create new URL for the audio blob
      const newUrl = URL.createObjectURL(audioBlob);
      setAudioUrl(newUrl);
    }
    return () => {
      // Cleanup on unmount
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioBlob]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const startRecording = async () => {
    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(audioStream, {
        mimeType: getSupportedMimeType()
      });
      const audioChunks: BlobPart[] = [];

      // Play start tone
      playTone(750, 0.15, 'start'); // Higher frequency for start

      recorder.ondataavailable = (event) => {
        audioChunks.push(event.data);
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
        setAudioBlob(audioBlob);
        audioStream.getTracks().forEach(track => track.stop());
        setStream(null);
        setMediaRecorder(null);
        setRecordingTime(0);

        // Play stop tone
        playTone(440, 0.15, 'stop'); // Lower frequency for stop
      };

      setIsRecording(true);
      setStream(audioStream);
      setMediaRecorder(recorder);
      recorder.start();
    } catch (err) {
      console.error("Error accessing microphone:", err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
      setIsRecording(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-6 w-full">
      <div className="relative flex flex-col items-center">
        <Button
          onClick={isRecording ? stopRecording : startRecording}
          variant="default"
          size="icon"
          className={cn(
            "relative group size-20 sm:size-24 rounded-full flex items-center justify-center p-0 transition-all duration-300 hover:scale-[1.04] active:scale-[0.97] shadow-lg",
            isRecording &&
              "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/40 border-transparent"
          )}
        >
          {isRecording && (
            <div className="absolute inset-0 rounded-full animate-ping bg-white/25" />
          )}

          <div className="relative flex size-full items-center justify-center">
            {isRecording ? (
              <div
                aria-hidden
                className="size-[28%] shrink-0 rounded-[2px] bg-white"
              />
            ) : (
              <Mic className="size-[38%] text-primary-foreground stroke-[2]" />
            )}
          </div>
        </Button>

        <div className="mt-4 h-6 flex items-center justify-center">
          {isRecording ? (
            <div className="flex items-center gap-2 text-destructive">
              <div className="w-[6px] h-[6px] rounded-full bg-destructive animate-pulse" />
              <span className="text-body font-bold tabular-nums">{formatTime(recordingTime)}</span>
            </div>
          ) : (
            <span className="text-body-sm text-zinc-500">
              {audioBlob ? 'Ready to search' : 'Tap to record'}
            </span>
          )}
        </div>
      </div>

      {audioBlob && audioUrl && (
        <div className={cn(
          "w-full transition-all duration-300",
          isRecording && "opacity-50 pointer-events-none"
        )}>
          <audio
            controls
            className="w-full h-8"
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            key={audioUrl}
          >
            <source src={audioUrl} type="audio/webm" />
            Your browser does not support the audio element.
          </audio>
        </div>
      )}
    </div>
  );
}