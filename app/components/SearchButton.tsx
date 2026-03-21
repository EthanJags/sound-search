"use client";

import { useState } from "react";
import { Search, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { extractFeatures } from "@/app/lib/audio-features";
import { Button } from "@/components/ui/button";

interface SearchButtonProps {
  audioBlob: Blob | null;
  searchMode: ("demo" | "own")[];
  setRanking: (ranking: {
    filename: string;
    similarity: number;
  }[]) => void;
  setRankedSounds: (sounds: {
    filename: string;
    similarity: number;
  }[]) => void;
  ranking: {
    filename: string;
    similarity: number;
  }[];
  setStartingIndex: (value: number | ((prev: number) => number)) => void;
  batchSize: number;
  startingIndex: number;
}

export default function SearchButton({ audioBlob, searchMode, setRanking, setRankedSounds, setStartingIndex, batchSize }: SearchButtonProps) {
  const [isSearching, setIsSearching] = useState(false);
  const [searchStatus, setSearchStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const handleSearch = async () => {
    if (!audioBlob) return;
    setIsSearching(true);
    setSearchStatus(null);

    try {
      // Extract audio features client-side (83-dim vector)
      const vector = await extractFeatures(audioBlob);

      // Search via local API route
      const response = await fetch("/api/search", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vector }),
      });
      if (!response.ok) {
        throw new Error('Search failed');
      }

      const data = await response.json();
      const matches = data.matches;
      console.log("matches", matches)
      // Convert matches to ranked sounds format
      // Search results include blob URLs directly — no separate audio fetch needed
      const mappedRanking = matches.map((match: any) => ({
        filename: match.id,
        similarity: match.score,
        file_path: match.metadata.file_path,
        audioUrl: match.audioUrl,
        soundPack: match.sound_pack,
      }));
      setRanking(mappedRanking);

      setStartingIndex(prev => prev + batchSize);
      setRankedSounds(mappedRanking.slice(0, batchSize));
      

      setSearchStatus({
        type: "success",
        message: "Search completed successfully!"
      });

    } catch (error) {
      console.error('Error searching:', error);
      setSearchStatus({
        type: "error",
        message: "Failed to perform search. Please try again."
      });
      setRankedSounds([]);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 w-full">
      <Button
        onClick={handleSearch}
        disabled={!audioBlob || isSearching}
        size="lg"
        className="w-full text-body font-bold h-12 rounded-full text-primary-foreground"
      >
        {isSearching ? (
          <>
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            Searching...
          </>
        ) : (
          <>
            <Search className="w-5 h-5 mr-2" />
            Search with Audio
          </>
        )}
      </Button>

      {searchStatus && (
        <div className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm animate-in fade-in slide-in-from-top-2 ${
          searchStatus.type === "error"
            ? "bg-destructive/10 text-destructive"
            : "bg-green-500/10 text-green-600 dark:text-green-400"
        }`}>
          {searchStatus.type === "error" ? (
            <AlertCircle className="h-4 w-4 shrink-0" />
          ) : (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          )}
          <span>{searchStatus.message}</span>
        </div>
      )}
    </div>
  );
}