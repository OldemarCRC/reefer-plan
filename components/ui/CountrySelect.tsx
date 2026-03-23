'use client';

import { useState, useEffect, useRef, KeyboardEvent } from 'react';
import { getCountries, CountryOption } from '@/app/actions/country';
import styles from './CountrySelect.module.css';

interface CountrySelectProps {
  value: string;                     // ISO alpha-2 code, e.g. "CL"
  onChange: (code: string) => void;
  placeholder?: string;
  required?: boolean;
}

export default function CountrySelect({
  value,
  onChange,
  placeholder = 'Search country…',
  required,
}: CountrySelectProps) {
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [inputText, setInputText] = useState('');
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load countries once on mount
  useEffect(() => {
    getCountries().then(setCountries);
  }, []);

  // Sync display text when value prop changes externally
  useEffect(() => {
    if (!value) {
      setInputText('');
      return;
    }
    const found = countries.find((c) => c.code === value);
    if (found) setInputText(`${found.flag} ${found.name}`);
  }, [value, countries]);

  const filtered = inputText
    ? countries.filter((c) => {
        const q = inputText.replace(/[\p{Emoji}]/gu, '').trim().toLowerCase();
        if (!q) return true;
        return (
          c.name.toLowerCase().includes(q) ||
          c.code.toLowerCase().includes(q)
        );
      })
    : countries;

  function selectCountry(c: CountryOption) {
    setInputText(`${c.flag} ${c.name}`);
    onChange(c.code);
    setOpen(false);
  }

  function handleInputChange(text: string) {
    setInputText(text);
    setHighlighted(0);
    setOpen(true);
    // If the user has cleared the field, notify parent
    if (!text.trim()) onChange('');
  }

  function handleBlur() {
    // Small delay so click on dropdown item registers first
    setTimeout(() => {
      setOpen(false);
      // Reset to last valid selection if input doesn't match
      const found = countries.find((c) => c.code === value);
      if (found) {
        setInputText(`${found.flag} ${found.name}`);
      } else {
        setInputText('');
        onChange('');
      }
    }, 150);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') setOpen(true);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[highlighted]) selectCountry(filtered[highlighted]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div className={styles.wrapper} ref={containerRef}>
      <input
        ref={inputRef}
        type="text"
        className={styles.input}
        value={inputText}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
      />
      {open && filtered.length > 0 && (
        <ul className={styles.dropdown} role="listbox">
          {filtered.map((c, i) => (
            <li
              key={c.code}
              role="option"
              aria-selected={c.code === value}
              className={`${styles.option} ${i === highlighted ? styles.highlighted : ''}`}
              onMouseDown={() => selectCountry(c)}
              onMouseEnter={() => setHighlighted(i)}
            >
              <span className={styles.flag}>{c.flag}</span>
              <span className={styles.name}>{c.name}</span>
              <span className={styles.code}>{c.code}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
