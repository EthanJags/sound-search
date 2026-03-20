import Checkbox from "./Checkbox";


export default function SearchModeSelector({ searchMode, setSearchMode }: {
  searchMode: ("demo" | "own")[];
  setSearchMode: (mode: ("demo" | "own")[]) => void
}) {
  const toggleMode = (mode: "demo" | "own") => {
    if (searchMode.includes(mode)) {
      setSearchMode(searchMode.filter(m => m !== mode));
    } else {
      setSearchMode([...searchMode, mode]); 
    }
  };

  return (
    <div className="flex items-center gap-4">
      <span>Search on:</span>
      <Checkbox
        label="Demo samples"
        checked={searchMode.includes('demo')}
        onChange={() => toggleMode('demo')}
      />
      <Checkbox
        label="My own samples"
        checked={searchMode.includes('own')}
        onChange={() => toggleMode('own')}
      />
    </div>
  );
}