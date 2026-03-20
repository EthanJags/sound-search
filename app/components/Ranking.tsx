import { FC } from 'react';
import { useState } from 'react';
import { Play, Download, Pause } from 'lucide-react';

interface RankedSound {
  filename: string;
  similarity: number;
  audioUrl?: string;
}

interface RankingProps {
  ranked_sounds?: RankedSound[];
}

const RankedSoundItem = ({ sound, index }: { sound: RankedSound; index: number }) => {
  const [isPlaying, setIsPlaying] = useState(false);

  return (
    <div 
      className="group relative overflow-hidden backdrop-blur-sm bg-white/40 dark:bg-gray-800/40 rounded-xl border border-gray-200 dark:border-gray-700 transition-all duration-300 hover:shadow-lg hover:shadow-indigo-100 dark:hover:shadow-indigo-900/20"
    >
      <div className="absolute inset-0 bg-gradient-to-r from-indigo-50/10 to-purple-50/10 dark:from-indigo-900/10 dark:to-purple-900/10 opacity-0 group-hover:opacity-100 transition-opacity" />
      
      <div className="relative p-4 space-y-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-semibold">
              {index + 1}
            </div>
            <span className="font-medium text-gray-700 dark:text-gray-300">{sound.filename}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 text-sm rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400">
              {(sound.similarity * 100).toFixed(1)}% match
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {sound.audioUrl && (
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
            >
              {isPlaying ? (
                <>
                  <Pause size={16} /> Pause Audio
                </>
              ) : (
                <>
                  <Play size={16} /> Play Audio
                </>
              )}
            </button>
          )}

          {isPlaying && (
            <div className="rounded-lg bg-gray-50 dark:bg-gray-900/50 p-3">
              <audio
                controls
                controlsList="nodownload noplaybackrate"
                className="w-full"
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
              >
                <source src={sound.audioUrl} type="audio/ogg" />
                Your browser does not support the audio element.
              </audio>
            </div>
          )}

          {sound.audioUrl && (
            <a
              href={sound.audioUrl}
              download={sound.filename}
              className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <Download size={16} />
              Download sound
            </a>
          )}
        </div>
      </div>
    </div>
  );
};

const Ranking: FC<RankingProps> = ({ ranked_sounds = [] }) => {
  if (!ranked_sounds.length) return null;

  return (
    <div className="w-full space-y-4">
      <div className="space-y-3">
        {ranked_sounds.map((sound, index) => (
          <RankedSoundItem 
            key={sound.filename}
            sound={sound} 
            index={index}
          />
        ))}
      </div>
    </div>
  );
};

export default Ranking;