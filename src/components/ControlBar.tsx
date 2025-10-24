import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { RefreshCw, Sun, Moon, Target } from "lucide-react";
import { useTheme } from "next-themes";

interface ControlBarProps {
  timeline: string;
  onTimelineChange: (value: string) => void;
  benchmark: string;
  onFetchData: () => void;
  isLoading: boolean;
  tailLength: number;
  onTailLengthChange: (value: number) => void;
  onCenterGraph: () => void;
}

export const ControlBar = ({
  timeline,
  onTimelineChange,
  benchmark,
  onFetchData,
  isLoading,
  tailLength,
  onTailLengthChange,
  onCenterGraph,
}: ControlBarProps) => {
  const { theme, setTheme } = useTheme();

  return (
    <div className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
      <div className="px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">Timeline:</span>
            <Select value={timeline} onValueChange={onTimelineChange}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Daily">Daily</SelectItem>
                <SelectItem value="Weekly">Weekly</SelectItem>
                <SelectItem value="Monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">Benchmark:</span>
            <span className="text-sm font-semibold text-foreground px-3 py-1.5 rounded-md bg-accent">
              {benchmark}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">Tail Length:</span>
            <Slider
              value={[tailLength]}
              onValueChange={(values) => onTailLengthChange(values[0])}
              min={3}
              max={20}
              step={1}
              className="w-32"
            />
            <Input
              type="number"
              value={tailLength}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                if (!isNaN(val) && val >= 3 && val <= 20) {
                  onTailLengthChange(val);
                }
              }}
              min={3}
              max={20}
              className="w-16 h-9 text-center"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={onCenterGraph}
            className="h-9 w-9"
            title="Center Graph"
          >
            <Target className="h-4 w-4" />
            <span className="sr-only">Center graph</span>
          </Button>

          <Button
            variant="outline"
            size="icon"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="h-9 w-9"
          >
            <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            <span className="sr-only">Toggle theme</span>
          </Button>

          <Button
            onClick={onFetchData}
            disabled={isLoading}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            {isLoading ? "Fetching..." : "Fetch Data"}
          </Button>
        </div>
      </div>
    </div>
  );
};
