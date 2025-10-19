import { useState } from "react";
import { ArrowUpDown, Eye, EyeOff } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface StockData {
  symbol: string;
  name: string;
  sector: string;
  industry: string;
  price: number;
  change: number;
  "RS-Ratio": number;
  "RS-Momentum": number;
  visible: boolean;
}

interface StockTableProps {
  data: StockData[];
  onVisibilityToggle: (symbol: string) => void;
}

type SortField = "symbol" | "name" | "change";
type SortDirection = "asc" | "desc";

export const StockTable = ({ data, onVisibilityToggle }: StockTableProps) => {
  const [sortField, setSortField] = useState<SortField>("symbol");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const sortedData = [...data].sort((a, b) => {
    const multiplier = sortDirection === "asc" ? 1 : -1;
    if (sortField === "change") {
      return (a.change - b.change) * multiplier;
    }
    return a[sortField].localeCompare(b[sortField]) * multiplier;
  });

  const getRowColor = (index: number) => {
    return index % 2 === 0 ? "bg-accent/10" : "bg-primary/5";
  };

  const getTailWidth = (rsRatio: number, rsMomentum: number) => {
    const strength = Math.abs(rsRatio - 100) + Math.abs(rsMomentum - 100);
    return Math.min(100, (strength / 20) * 100);
  };

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-card hover:bg-card">
            <TableHead className="w-12">Chart</TableHead>
            <TableHead className="w-20">Visible</TableHead>
            <TableHead className="w-24">Tail</TableHead>
            <TableHead 
              className="cursor-pointer select-none"
              onClick={() => handleSort("symbol")}
            >
              <div className="flex items-center gap-2">
                Symbol
                <ArrowUpDown className="h-4 w-4" />
              </div>
            </TableHead>
            <TableHead 
              className="cursor-pointer select-none"
              onClick={() => handleSort("name")}
            >
              <div className="flex items-center gap-2">
                Name
                <ArrowUpDown className="h-4 w-4" />
              </div>
            </TableHead>
            <TableHead>Sector</TableHead>
            <TableHead>Industry</TableHead>
            <TableHead className="text-right">Price</TableHead>
            <TableHead 
              className="text-right cursor-pointer select-none"
              onClick={() => handleSort("change")}
            >
              <div className="flex items-center justify-end gap-2">
                % Change
                <ArrowUpDown className="h-4 w-4" />
              </div>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedData.map((stock, index) => (
            <TableRow key={stock.symbol} className={getRowColor(index)}>
              <TableCell>
                <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
                  <div className="w-3 h-3 rounded-full bg-primary" />
                </div>
              </TableCell>
              <TableCell>
                <Checkbox
                  checked={stock.visible}
                  onCheckedChange={() => onVisibilityToggle(stock.symbol)}
                />
              </TableCell>
              <TableCell>
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-300"
                    style={{ width: `${getTailWidth(stock["RS-Ratio"], stock["RS-Momentum"])}%` }}
                  />
                </div>
              </TableCell>
              <TableCell className="font-medium">{stock.symbol}</TableCell>
              <TableCell>{stock.name}</TableCell>
              <TableCell className="text-muted-foreground">{stock.sector}</TableCell>
              <TableCell className="text-muted-foreground">{stock.industry}</TableCell>
              <TableCell className="text-right">${stock.price.toFixed(2)}</TableCell>
              <TableCell className={`text-right font-medium ${
                stock.change >= 0 ? "text-quadrant-leading" : "text-quadrant-lagging"
              }`}>
                {stock.change >= 0 ? "+" : ""}{stock.change.toFixed(2)}%
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
