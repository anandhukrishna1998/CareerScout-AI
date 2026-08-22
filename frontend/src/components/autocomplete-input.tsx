"use client";

import { useState, useEffect, useRef } from "react";
import { fetchApi } from "@/lib/api";

type AutocompleteInputProps = {
  type: "keyword" | "location";
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
  className?: string;
};

export function AutocompleteInput({ type, value, onChange, placeholder, className }: AutocompleteInputProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Click outside to close
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!value || !isOpen) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetchApi(`/jobs/suggestions/autocomplete?type=${type}&q=${encodeURIComponent(value)}`);
        const data = await res.json();
        setSuggestions(data.suggestions || []);
      } catch (err) {
        console.error("Failed to fetch suggestions", err);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [value, type, isOpen]);

  return (
    <div className="relative" ref={wrapperRef}>
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        placeholder={placeholder}
        className={className}
      />
      {isOpen && (suggestions.length > 0 || loading) && (
        <ul className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-white/10 bg-black/90 backdrop-blur-md shadow-[0_0_15px_rgba(0,0,0,0.5)] py-1 text-sm text-white">
          {loading ? (
            <li className="px-3 py-2 text-zinc-500">Loading...</li>
          ) : (
            suggestions.map((s, i) => (
              <li
                key={i}
                className="cursor-pointer px-3 py-2 hover:bg-brand/20 hover:text-brand transition-colors"
                onClick={() => {
                  onChange(s);
                  setIsOpen(false);
                }}
              >
                {s}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
