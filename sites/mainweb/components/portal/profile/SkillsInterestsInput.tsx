"use client";

import { useState } from "react";
import type { KeyboardEvent } from "react";
import { input, fieldHint } from "@/components/portal/ui";

interface SkillsInterestsInputProps {
  items: string[];
  setItems: (items: string[]) => void;
  placeholder: string;
  maxItems: number;
}

export default function SkillsInterestsInput({
  items,
  setItems,
  placeholder,
  maxItems,
}: SkillsInterestsInputProps) {
  const [inputValue, setInputValue] = useState("");

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && inputValue.trim()) {
      e.preventDefault();
      if (items.length < maxItems && !items.includes(inputValue.trim())) {
        setItems([...items, inputValue.trim()]);
        setInputValue("");
      }
    }
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  return (
    <div>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {items.map((item, index) => (
            <span
              key={index}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-medium)] pl-3 pr-2 py-1 text-[13px] text-[var(--text-primary)]"
            >
              {item}
              <button
                type="button"
                onClick={() => removeItem(index)}
                aria-label={`Remove ${item}`}
                className="px-1 leading-none text-[var(--text-subtle)] hover:text-[var(--danger)] transition-colors"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        maxLength={50}
        disabled={items.length >= maxItems}
        className={`${input} disabled:cursor-not-allowed`}
        placeholder={items.length >= maxItems ? `Limit reached` : placeholder}
      />
      <p className={fieldHint}>
        Press Enter to add · {items.length}/{maxItems}
      </p>
    </div>
  );
}
