"use client";

import { useState } from "react";
import { Search, Loader2 } from 'lucide-react';
import { extractMFCC } from "@/app/lib/mfcc";

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
      // Extract MFCC features client-side
      const vector = await extractMFCC(audioBlob);

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
    <div className="flex flex-col gap-4">
      <button
        onClick={handleSearch}
        disabled={!audioBlob || isSearching}
        className={`
          relative group overflow-hidden
          px-6 py-3 rounded-xl
          bg-gradient-to-r from-indigo-500 to-purple-500
          dark:from-indigo-600 dark:to-purple-600
          text-white font-medium
          transition-all duration-300
          hover:shadow-lg hover:shadow-indigo-500/25
          dark:hover:shadow-indigo-600/25
          disabled:opacity-50 disabled:cursor-not-allowed
          disabled:hover:shadow-none
        `}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-700 dark:to-purple-700 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        <div className="relative flex items-center justify-center gap-2">
          {isSearching ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Searching...</span>
            </>
          ) : (
            <>
              <Search className="w-4 h-4" />
              <span>Search with Audio</span>
            </>
          )}
        </div>
      </button>

      {searchStatus && (
        <div 
          className={`
            flex items-center gap-3 p-4 rounded-xl
            backdrop-blur-sm transition-all duration-300
            ${searchStatus.type === "success" 
              ? "bg-green-50/80 dark:bg-green-900/20 text-green-800 dark:text-green-200 border border-green-200 dark:border-green-800"
              : "bg-red-50/80 dark:bg-red-900/20 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800"
            }
          `}
        >
          <div className={`w-2 h-2 rounded-full ${
            searchStatus.type === "success" 
              ? "bg-green-500 dark:bg-green-400"
              : "bg-red-500 dark:bg-red-400"
          }`} />
          {searchStatus.message}
        </div>
      )}
    </div>
  );
}