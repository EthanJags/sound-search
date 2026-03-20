"use client";

import { useState } from "react";

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

  return (
    <div className="flex justify-center mt-8">
      <button
        onClick={() => showMore(startingIndex, batchSize)}
        disabled={isLoading}
        className={`
          px-6 py-2 text-sm font-medium text-white 
          bg-indigo-600 rounded-md hover:bg-indigo-700 
          transition-colors
          disabled:opacity-50 disabled:cursor-not-allowed
        `}
      >
        {isLoading ? (
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Loading...
          </div>
        ) : (
          'Show More'
        )}
      </button>
    </div>
  );
}