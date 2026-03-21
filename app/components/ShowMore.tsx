"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface ShowMoreProps {
  setRankedSounds: (rankedSounds: any) => void;
  startingIndex: number;
  setStartingIndex: (value: number | ((prev: number) => number)) => void;
  batchSize: number;
  ranking: any;
}

export default function ShowMore({ setRankedSounds, startingIndex, setStartingIndex, batchSize, ranking }: ShowMoreProps) {
    const [isLoading, setIsLoading] = useState(false);
    
    const showMore = (startingIndex: number, batchSize: number) => {
        // Ranking already contains audioUrl from the search API — just slice the next batch
        const endIndex = startingIndex + batchSize;
        const nextBatch = ranking.slice(startingIndex, endIndex);

        setStartingIndex((prev: number) => prev + batchSize);
        setRankedSounds((prev: any[]) => [...prev, ...nextBatch]);
    }

  // Only show the button if there are more items to load
  if (startingIndex >= ranking.length && ranking.length > 0) {
    return null;
  }

  return (
    <div className="flex justify-center mt-4">
      <Button
        onClick={() => showMore(startingIndex, batchSize)}
        disabled={isLoading}
        variant="secondary"
        className="text-body-sm font-bold rounded-full px-6 h-8"
      >
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Loading...
          </>
        ) : (
          'Show More'
        )}
      </Button>
    </div>
  );
}