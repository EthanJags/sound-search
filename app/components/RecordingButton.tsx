"use client";

import { useState, useEffect } from "react";
import { Mic, Square, Play, Pause } from "lucide-react";

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
  <div className="flex flex-col items-center gap-8">
    <div className="relative mb-16">
      <button
        onClick={isRecording ? stopRecording : startRecording}
        className={`
          relative group
          w-32 h-32 sm:w-40 sm:h-40
          rounded-full
          flex items-center justify-center
          transition-colors duration-500
          ${isRecording ? 
            'bg-gradient-to-r from-red-500 to-rose-500' : 
            'bg-gradient-to-r from-indigo-500 to-purple-500 hover:scale-105'
          }
        `}
      >
        {/* Outer ring animation - ONLY animation should be here */}
        {isRecording && (
          <div className="absolute inset-0 rounded-full animate-ping bg-red-500/20" />
        )}
        
        {/* Center icon container - NO animations or transitions */}
        <div className="
          relative
          w-16 h-16 sm:w-20 sm:h-20
          rounded-full
          flex items-center justify-center
        ">
          {isRecording ? (
            <Square className="w-10 h-10 sm:w-16 sm:h-16 text-white" />
          ) : (
            <Mic className="w-10 h-10 sm:w-20 sm:h-20 text-white stroke-[1.5] stroke-black translate-y-1" />
          )}
        </div>
      </button>

        {/* Recording time or status text */}
        <div className={`
          absolute bottom-[-3rem] left-1/2 -translate-x-1/2
          text-center transition-all duration-500
          ${isRecording ? 'scale-110' : 'scale-100'}
        `}>
          {isRecording ? (
            <div className="flex items-center gap-2 text-red-500 font-medium">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-xl">{formatTime(recordingTime)}</span>
            </div>
          ) : (
            <span className="text-gray-500 dark:text-gray-400 whitespace-nowrap truncate">
              {audioBlob ? 'New Recording' : 'Start Recording'}
            </span>
          )}
        </div>
      </div>

    {/* Audio playback */}
    {audioBlob && audioUrl && (
      <div className={`
        w-full max-w-md mb-8
        transition-all duration-500 ease-out
        ${isRecording ? 'opacity-50' : 'opacity-100'}
      `}>
        <audio
          controls
          className="w-full"
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          key={audioUrl} // Add key to force re-render when URL changes
        >
          <source src={audioUrl} type="audio/webm" />
          Your browser does not support the audio element.
        </audio>
      </div>
    )}
  </div>
)
};