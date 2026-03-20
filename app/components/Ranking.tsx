import { FC } from 'react';
import { useState } from 'react';
import { Play, Download, Pause } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

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
    <Card className="group relative overflow-hidden transition-all duration-300 hover:shadow-md hover:border-primary/50 bg-white dark:bg-white text-zinc-950 border-zinc-200/80 ring-zinc-200/40">
      <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
      
      <CardContent className="p-4 space-y-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            {sound.audioUrl && (
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                {isPlaying ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
              </button>
            )}
            <span className="font-medium font-mono text-zinc-950 truncate max-w-[200px] sm:max-w-xs" title={sound.filename}>
              {sound.filename}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="font-mono bg-primary/10 text-primary hover:bg-primary/20">
              {(sound.similarity * 100).toFixed(1)}% match
            </Badge>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          {sound.audioUrl && (
            <a
              href={sound.audioUrl}
              download={sound.filename}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center justify-center whitespace-nowrap rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 hover:bg-zinc-100 h-8 px-3 py-2 font-mono text-xs gap-2 text-zinc-600 hover:text-zinc-950"
            >
              <Download size={14} />
              Download
            </a>
          )}
        </div>

        {isPlaying && sound.audioUrl && (
          <div className="rounded-lg bg-zinc-50 border border-zinc-200/80 p-3 mt-2 animate-in fade-in slide-in-from-top-2">
            <audio
              controls
              controlsList="nodownload noplaybackrate"
              className="w-full h-10"
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              autoPlay
            >
              <source src={sound.audioUrl} type="audio/ogg" />
              Your browser does not support the audio element.
            </audio>
          </div>
        )}
      </CardContent>
    </Card>
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