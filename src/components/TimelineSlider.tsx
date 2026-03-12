import { useCallback, useRef, useState, useEffect, useMemo } from "react";

/* ------------------------------------------------------------------ */
/*  TYPES                                                              */
/* ------------------------------------------------------------------ */

interface TimelineSliderProps {
  /** Total number of available weeks of data */
  totalWeeks: number;
  /** Current window size (how many weeks are visible) */
  windowSize: number;
  /** The ending week index (0 = latest week, totalWeeks-1 = oldest) */
  endWeek: number;
  /** Called when the user drags the slider window */
  onWindowChange: (endWeek: number) => void;
  /** Called when window size changes */
  onWindowSizeChange?: (size: number) => void;
  /** Label for the ending date */
  endDateLabel?: string;
}

/* ------------------------------------------------------------------ */
/*  COMPONENT                                                          */
/* ------------------------------------------------------------------ */

export const TimelineSlider = ({
  totalWeeks,
  windowSize,
  endWeek,
  onWindowChange,
  endDateLabel,
}: TimelineSliderProps) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const safeTotal = Math.max(totalWeeks, 1);
  const safeWindow = Math.min(windowSize, safeTotal);

  // The thumb represents the visible window — its left edge = start week, right edge = end week
  // endWeek = 0 means "latest"; for display we invert so latest is at the right
  const thumbWidthPct = (safeWindow / safeTotal) * 100;

  // position: endWeek=0 → thumb is at the far right
  // endWeek=totalWeeks-windowSize → thumb at far left
  const maxEnd = Math.max(safeTotal - safeWindow, 0);
  const leftPct = ((maxEnd - endWeek) / Math.max(maxEnd, 1)) * (100 - thumbWidthPct);

  const updatePosition = useCallback((clientX: number) => {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    // pct=0 → oldest (endWeek=maxEnd), pct=1 → latest (endWeek=0)
    const newEnd = Math.round((1 - pct) * maxEnd);
    onWindowChange(Math.max(0, Math.min(maxEnd, newEnd)));
  }, [maxEnd, onWindowChange]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
    updatePosition(e.clientX);
  }, [updatePosition]);

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e: MouseEvent) => updatePosition(e.clientX);
    const handleUp = () => setDragging(false);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [dragging, updatePosition]);

  // Week labels
  const labels = useMemo(() => {
    if (safeTotal <= 1) return [];
    const step = Math.max(1, Math.floor(safeTotal / 6));
    const out: { pct: number; label: string }[] = [];
    for (let i = 0; i <= safeTotal; i += step) {
      const weeksAgo = safeTotal - i;
      out.push({
        pct: (i / safeTotal) * 100,
        label: weeksAgo === 0 ? "Now" : `-${weeksAgo}w`,
      });
    }
    // Always add "Now" at 100%
    if (out[out.length - 1]?.pct !== 100) {
      out.push({ pct: 100, label: "Now" });
    }
    return out;
  }, [safeTotal]);

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
          Showing data for <b className="text-gray-800 dark:text-gray-200">{safeWindow} weeks</b>
          {endDateLabel && (
            <> ending <b className="text-gray-800 dark:text-gray-200">{endDateLabel}</b></>
          )}
        </span>
        <span className="text-[10px] text-gray-400">
          Drag window to see historic data
        </span>
      </div>

      {/* Track */}
      <div
        ref={trackRef}
        className="relative h-7 rounded-md cursor-pointer select-none"
        style={{ background: "linear-gradient(90deg, #e5e7eb 0%, #93c5fd 50%, #3b82f6 100%)" }}
        onMouseDown={handleMouseDown}
      >
        {/* Thumb (draggable window) */}
        <div
          className="absolute top-0 h-full rounded-md border-2 border-blue-600 transition-[left] duration-75"
          style={{
            left: `${leftPct}%`,
            width: `${thumbWidthPct}%`,
            minWidth: 24,
            background: "rgba(59,130,246,0.35)",
            boxShadow: "0 0 0 1px rgba(59,130,246,0.5)",
            cursor: dragging ? "grabbing" : "grab",
          }}
        >
          {/* Grip lines */}
          <div className="absolute inset-0 flex items-center justify-center gap-0.5 pointer-events-none">
            <div className="w-0.5 h-3 bg-blue-500 rounded-full opacity-60" />
            <div className="w-0.5 h-3 bg-blue-500 rounded-full opacity-60" />
            <div className="w-0.5 h-3 bg-blue-500 rounded-full opacity-60" />
          </div>
        </div>
      </div>

      {/* Tick labels */}
      <div className="relative h-4 mt-0.5">
        {labels.map((l, i) => (
          <span
            key={i}
            className="absolute text-[10px] text-gray-400 -translate-x-1/2"
            style={{ left: `${l.pct}%` }}
          >
            {l.label}
          </span>
        ))}
      </div>
    </div>
  );
};
