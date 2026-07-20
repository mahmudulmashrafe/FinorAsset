import React, { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface Option {
  value: string;
  label: string;
  icon?: React.ReactNode;
  imageUrl?: string;
}

interface SearchableSelectProps {
  options: Option[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  className?: string;
  triggerClassName?: string;
  disabled?: boolean;
}

export function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  emptyMessage = "No results found.",
  className,
  triggerClassName,
  disabled,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = options.filter((opt) =>
    opt.label.toLowerCase().includes(search.toLowerCase())
  );

  const selectedOption = options.find((opt) => opt.value === value);

  return (
    <Popover open={open && !disabled} onOpenChange={(val) => { setOpen(val); if (!val) setSearch(""); }}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between font-normal bg-background h-10 px-3 text-sm rounded-md border text-left disabled:opacity-50 disabled:cursor-not-allowed", triggerClassName)}
        >
          <span className="flex items-center gap-2 truncate">
            {selectedOption ? (
              <>
                {selectedOption.imageUrl ? (
                  <img src={selectedOption.imageUrl} alt="" className="h-4.5 w-4.5 rounded-full object-cover shrink-0 border border-border/40" />
                ) : selectedOption.icon ? (
                  selectedOption.icon
                ) : null}
                <span>{selectedOption.label}</span>
              </>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn("w-[var(--radix-popover-trigger-width)] p-0 z-[200]", className)}>
        <div className="p-2 border-b border-border">
          <Input
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-xs bg-background"
            autoFocus
          />
        </div>
        <div className="max-h-60 overflow-y-auto p-1 space-y-0.5 thin-scroll">
          {filtered.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-4">{emptyMessage}</div>
          ) : (
            filtered.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onValueChange(opt.value);
                    setOpen(false);
                    setSearch("");
                  }}
                  className={cn(
                    "w-full text-left px-2.5 py-2 text-xs rounded-md flex items-center justify-between hover:bg-accent hover:text-accent-foreground transition-all cursor-pointer",
                    isSelected ? "bg-accent/40 font-semibold" : ""
                  )}
                >
                  <span className="flex items-center gap-2 truncate">
                    {opt.imageUrl ? (
                      <img src={opt.imageUrl} alt="" className="h-4 w-4 rounded-full object-cover shrink-0 border border-border/40" />
                    ) : opt.icon ? (
                      opt.icon
                    ) : null}
                    <span>{opt.label}</span>
                  </span>
                  {isSelected && <Check className="h-3.5 w-3.5 text-accent flex-shrink-0" />}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
