'use client';

import { useState, KeyboardEvent } from 'react';

interface SkillsInterestsInputProps {
  items: string[];
  setItems: (items: string[]) => void;
  placeholder: string;
  maxItems: number;
  accentColor: string;
}

export default function SkillsInterestsInput({
  items,
  setItems,
  placeholder,
  maxItems,
  accentColor,
}: SkillsInterestsInputProps) {
  const [inputValue, setInputValue] = useState('');

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      e.preventDefault();
      if (items.length < maxItems && !items.includes(inputValue.trim())) {
        setItems([...items, inputValue.trim()]);
        setInputValue('');
      }
    }
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-3">
        {items.map((item, index) => (
          <span
            key={index}
            className={`px-3 py-1.5 bg-${accentColor}/10 border border-${accentColor}/30 text-${accentColor} text-[10px] uppercase tracking-wide flex items-center gap-2 group`}
          >
            {item}
            <button
              type="button"
              onClick={() => removeItem(index)}
              className="text-red-500 hover:text-red-400 transition-colors"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        maxLength={50}
        disabled={items.length >= maxItems}
        className="w-full bg-black/40 border border-white/10 rounded px-4 py-3 text-white text-sm focus:border-[#00A8A8]/50 focus:outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        placeholder={items.length >= maxItems ? `Limit reached` : placeholder}
      />
      <p className="text-[10px] text-gray-600 mt-1">
        Press Enter to add • {items.length}/{maxItems}
      </p>
    </div>
  );
}