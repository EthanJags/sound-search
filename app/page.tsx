"use client";

import RecordingButton from "./components/RecordingButton";
import SearchButton from "./components/SearchButton";
import { useState } from "react";
import Ranking from "./components/Ranking";
import { Waves } from "lucide-react";
import Script from "next/script";
import ShowMore from "./components/ShowMore";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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
  }[]>([]);

  return (
    <div className="min-h-screen blob-gradient text-foreground">
      <div className="absolute inset-0 grain-overlay pointer-events-none" />
      
      <div className="relative container max-w-4xl mx-auto px-4 py-16 sm:px-6 lg:px-8">
        <header className="text-center mb-12 space-y-4">
          <div className="flex items-center justify-center mb-6">
            <Waves className="w-12 h-12 text-primary animate-pulse" />
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-400 dark:to-purple-400">
            Sound Similarity Search
          </h1>
          <p className="text-lg text-muted-foreground font-mono max-w-2xl mx-auto">
            Discover perfect audio matches with the power of your voice.
          </p>
          <Script data-name="BMC-Widget" data-cfasync="false" src="https://cdnjs.buymeacoffee.com/1.0.0/widget.prod.min.js" data-id="aadityacobra" data-description="Support me on Buy me a coffee!" data-message="Thanks for visiting! If you enjoyed our work, buy us a coffee!" data-color="#BD5FFF" data-position="Right" data-x_margin="18" data-y_margin="18"></Script>
        </header>

        <main className="flex flex-col items-center space-y-8">
          <Card className="w-full max-w-2xl bg-white dark:bg-white text-zinc-950 border-zinc-200/80 shadow-xl ring-zinc-200/40">
            <CardHeader className="text-center pb-2">
              <CardTitle className="text-2xl">Record Audio</CardTitle>
              <CardDescription className="font-mono text-zinc-600 dark:text-zinc-600">
                Record a sound to find similar matches
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-8 pt-6">
              <div className="flex justify-center">
                <RecordingButton audioBlob={audioBlob} setAudioBlob={setAudioBlob} />
              </div>

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
            </CardContent>
          </Card>

          {rankedSounds.length > 0 && (
            <Card className="w-full max-w-2xl bg-white dark:bg-white text-zinc-950 border-zinc-200/80 shadow-xl ring-zinc-200/40 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-2xl">
                  Similar Sounds
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
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

        <footer className="mt-16 text-center space-y-4">
          <div className="inline-flex items-center space-x-1 text-sm text-muted-foreground bg-background/50 rounded-full px-4 py-2 backdrop-blur-sm border border-border">
            <span className="font-mono">Made with</span>
            <span className="text-red-500 animate-pulse">❤️</span>
            <span className="font-mono">by</span>
            <a href="https://ethanjagoda.me" className="text-primary hover:underline font-medium font-mono">
              Ethan Jagoda
            </a>
            <span className="font-mono">&</span>
            <a href="https://aadityapore.webflow.io/" className="text-primary hover:underline font-medium font-mono">
              Aaditya Pore
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
}
