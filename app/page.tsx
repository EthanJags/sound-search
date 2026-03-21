"use client";

import RecordingButton from "./components/RecordingButton";
import SearchButton from "./components/SearchButton";
import { useState } from "react";
import Ranking from "./components/Ranking";

import ShowMore from "./components/ShowMore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const batchSize = 10;

export default function Home() {
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [searchMode, setSearchMode] = useState([]);
  const [startingIndex, setStartingIndex] = useState<number>(0);
  const [ranking, setRanking] = useState<{
    filename: string;
    similarity: number;
  }[]>([]);
  const [rankedSounds, setRankedSounds] = useState<{
    filename: string;
    similarity: number;
    audioUrl?: string;
    soundPack?: string;
  }[]>([]);

  const hasResults = rankedSounds.length > 0;

  return (
    <div className="min-h-screen blob-gradient text-foreground flex flex-col">
      <div className="absolute inset-0 grain-overlay pointer-events-none" />

      <div className={`relative max-w-[640px] mx-auto px-6 pb-24 flex-1 w-full flex flex-col transition-[padding] duration-500 ease-out ${hasResults ? 'pt-16' : 'pt-[30vh]'}`}>
        <header className="text-center mb-8">
          <div className="flex items-center gap-3 mb-3 justify-center">
            <h1 className="text-title-lg sm:text-display font-extrabold font-display text-foreground">
              Sound Similarity Search
            </h1>
          </div>
          <p className="text-body text-muted-foreground">
            Discover perfect audio matches with the power of your voice.
          </p>
        </header>

        <main className="flex flex-col gap-6">
          <div className="space-y-4">
            <RecordingButton audioBlob={audioBlob} setAudioBlob={setAudioBlob} />

            {!hasResults && (
              <SearchButton
                audioBlob={audioBlob}
                searchMode={searchMode}
                setRankedSounds={setRankedSounds}
                setRanking={setRanking}
                ranking={ranking}
                startingIndex={startingIndex}
                batchSize={batchSize}
                setStartingIndex={setStartingIndex}
              />
            )}
          </div>

          {rankedSounds.length > 0 && (
            <Card className="bg-white dark:bg-white text-zinc-950 border-zinc-200/80 shadow-xl ring-zinc-200/40 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <CardHeader className="px-6 pt-6 pb-0">
                <CardTitle className="text-body-lg font-bold">
                  Similar Sounds
                </CardTitle>
              </CardHeader>
              <CardContent className="px-6 pb-6 pt-1 space-y-4">
                <Ranking ranked_sounds={rankedSounds} />

                <ShowMore
                  setRankedSounds={setRankedSounds}
                  startingIndex={startingIndex}
                  setStartingIndex={setStartingIndex}
                  batchSize={batchSize}
                  ranking={ranking}
                />
              </CardContent>
            </Card>
          )}
        </main>

      </div>

      <footer className="relative py-6 flex items-center justify-center gap-1 text-caption text-muted-foreground">
        <span>Made with</span>
        <span className="text-red-500">❤️</span>
        <span>by</span>
        <a href="https://ethanjagoda.me" className="text-primary hover:underline font-bold">
          Ethan Jagoda
        </a>
      </footer>
    </div>
  );
}
