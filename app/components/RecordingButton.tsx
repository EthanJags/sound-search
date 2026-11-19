"use client";

import { useState, useEffect } from "react";
import { Mic, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import AudioPlayer from "./AudioPlayer";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface RecordingButtonProps {
  audioBlob: Blob | null;
  setAudioBlob: (blob: Blob | null) => void;
}

export default function RecordingButton({ audioBlob, setAudioBlob }: RecordingButtonProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getSupportedMimeType = () => {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/ogg',
      'audio/mp4' // Safari
    ];
    // undefined lets the browser pick its own default format
    return types.find(type => MediaRecorder.isTypeSupported(type));
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
    setError(null);
    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getSupportedMimeType();
      const recorder = new MediaRecorder(audioStream, mimeType ? { mimeType } : undefined);
      const audioChunks: BlobPart[] = [];

      // Play start tone
      playTone(750, 0.15, 'start'); // Higher frequency for start

      recorder.ondataavailable = (event) => {
        audioChunks.push(event.data);
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunks, { type: recorder.mimeType || "audio/webm" });
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
      const name = (err as { name?: string })?.name;
      setError(
        name === "NotAllowedError" || name === "SecurityError"
          ? "Microphone access was blocked. Allow it in your browser settings, or drag in an audio file."
          : name === "NotFoundError"
            ? "No microphone found. Connect one, or drag in an audio file."
            : "Couldn't start recording. Try again, or drag in an audio file."
      );
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
      setIsRecording(false);
    }
  };

  useEffect(() => {
    if (audioBlob) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && e.target === document.body) {
        e.preventDefault();
        if (!isRecording) {
          startRecording();
        }
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault();
        if (isRecording) {
          stopRecording();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isRecording, mediaRecorder, audioBlob]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    // Some systems report no MIME type for audio files, so fall back to the extension
    const isAudio =
      file.type.startsWith('audio/') ||
      /\.(wav|mp3|ogg|oga|flac|m4a|aac|aif|aiff|webm|opus)$/i.test(file.name);
    if (isAudio) {
      setError(null);
      setAudioBlob(file);
    } else {
      setError("That file isn't audio. Drop a WAV, MP3, OGG or similar.");
    }
  };

  const hasAudio = audioBlob && audioUrl && !isRecording;

  return (
    <div className="w-full">
      {hasAudio ? (
        <div
          className="w-full flex items-center gap-3 px-4 py-3 rounded-full border border-zinc-300 bg-zinc-50 transition-all duration-200"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <AudioPlayer key={audioUrl} src={audioUrl} />
          <Tooltip>
            <TooltipTrigger
              onClick={startRecording}
              aria-label="Search new audio"
              className="shrink-0 size-9 rounded-full text-zinc-500 flex items-center justify-center hover:bg-zinc-200 hover:text-zinc-900 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300/60"
            >
              <RotateCcw className="size-4 stroke-[2.5]" />
            </TooltipTrigger>
            <TooltipContent>Search new audio</TooltipContent>
          </Tooltip>
        </div>
      ) : (
        <button
          onClick={isRecording ? stopRecording : startRecording}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            "w-full flex items-center gap-3 px-4 py-3 rounded-full border transition-all duration-200 cursor-pointer text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300/60 focus-visible:border-orange-300",
            isRecording
              ? "border-red-300 bg-red-50 ring-2 ring-red-200"
              : isDragging
                ? "border-orange-400 bg-orange-50 ring-2 ring-orange-200"
                : "border-zinc-300 bg-zinc-50 hover:border-zinc-400 hover:bg-zinc-100"
          )}
        >
          <div
            className={cn(
              "shrink-0 size-9 rounded-full flex items-center justify-center transition-colors duration-200",
              isRecording
                ? "bg-destructive text-white"
                : "bg-zinc-900 text-white"
            )}
          >
            {isRecording ? (
              <div className="size-3 rounded-[2px] bg-white" />
            ) : (
              <Mic className="size-4 stroke-[2.5]" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            {isDragging ? (
              <span className="text-body-sm text-orange-600 font-medium">Drop audio file here</span>
            ) : isRecording ? (
              <div className="flex items-center gap-2 text-destructive">
                <div className="w-[6px] h-[6px] rounded-full bg-destructive animate-pulse" />
                <span className="text-body font-bold tabular-nums">{formatTime(recordingTime)}</span>
                <span className="text-body-sm font-medium">Recording...</span>
              </div>
            ) : (
              <span className="text-body-sm text-zinc-400">Press the spacebar to record, or drag an audio file</span>
            )}
          </div>
        </button>
      )}
      {error && (
        <p role="alert" className="mt-2 px-4 text-body-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}