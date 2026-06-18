import { useState, useRef, useEffect, useId } from 'react';

export function Autocomplete({ value, onChange, options, placeholder, className }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value || '');
  const [prevValue, setPrevValue] = useState(value);
  const [activeIdx, setActiveIdx] = useState(-1);
  const ref = useRef(null);
  const inputRef = useRef(null);
  // Instance-scoped ids so multiple Autocompletes on one page (the Guards tab
  // mounts ~12 of them) don't share DOM ids and break their ARIA wiring.
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const optionId = i => `${baseId}-opt-${i}`;

  if (value !== prevValue) {
    setPrevValue(value);
    setQuery(value || '');
  }

  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('touchstart', handler); };
  }, []);

  const filtered = query.length === 0 ? [] : options.filter(o => o.toLowerCase().includes(query.toLowerCase())).slice(0, 12);

  function select(opt) {
    setQuery(opt);
    onChange(opt);
    setOpen(false);
    setActiveIdx(-1);
  }

  function handleChange(e) {
    setQuery(e.target.value);
    onChange(e.target.value);
    setOpen(true);
    setActiveIdx(-1);
  }

  function handleFocus() {
    if (query.length > 0) setOpen(true);
  }

  function handleKeyDown(e) {
    if (!open || filtered.length === 0) {
      if (e.key === 'Escape' && open) {
        setOpen(false);
        setActiveIdx(-1);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIdx(i => Math.min(i + 1, filtered.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIdx(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (activeIdx >= 0 && activeIdx < filtered.length) {
          select(filtered[activeIdx]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        setActiveIdx(-1);
        break;
    }
  }

  const activeDescendantId = activeIdx >= 0 && activeIdx < filtered.length
    ? optionId(activeIdx)
    : undefined;

  return (
    <div className={`autocomplete-wrap ${className || ''}`} ref={ref}>
      <input
        ref={inputRef}
        className="autocomplete-input"
        value={query}
        onChange={handleChange}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        placeholder={placeholder || 'Search…'}
        autoComplete="off"
        autoCorrect="off"
        spellCheck="false"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-activedescendant={activeDescendantId}
        aria-controls={listboxId}
      />
      {open && filtered.length > 0 && (
        <div id={listboxId} className="autocomplete-dropdown" role="listbox">
          {filtered.map((opt, i) => (
            <div
              key={opt}
              id={optionId(i)}
              className={`autocomplete-option${i === activeIdx ? ' active' : ''}`}
              role="option"
              aria-selected={i === activeIdx}
              onMouseDown={() => select(opt)}
              onTouchEnd={() => select(opt)}
              onMouseEnter={() => setActiveIdx(i)}
            >
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
