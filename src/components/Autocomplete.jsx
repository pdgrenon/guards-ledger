import { useState, useRef, useEffect, useId } from 'react';

export function Autocomplete({ value, onChange, options, placeholder, className, allowFreeText = false }) {
  const [open, setOpen] = useState(false);
  // `draft === null` means "not editing" — the input renders the committed
  // `value` prop. While the user is typing, `draft` holds the in-flight text and
  // `onChange` is NOT called, so partially-typed garbage never becomes real state
  // (and we don't spam an undo snapshot + sync write per keystroke). It is
  // resolved to a single `onChange` at a commit point: select / Enter / blur.
  const [draft, setDraft] = useState(null);
  const [activeIdx, setActiveIdx] = useState(-1);
  const ref = useRef(null);
  const inputRef = useRef(null);
  // Set while an option tap is in flight: option onMouseDown/onTouchEnd fire
  // before the input's blur, so the blur handler checks this to skip its
  // revert logic when a selection is landing.
  const selectingRef = useRef(false);
  const touchStartRef = useRef(null);
  // Instance-scoped ids so multiple Autocompletes on one page (the Guards tab
  // mounts ~12 of them) don't share DOM ids and break their ARIA wiring.
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const optionId = i => `${baseId}-opt-${i}`;

  const inputValue = draft !== null ? draft : (value || '');

  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('touchstart', handler); };
  }, []);

  const filtered = inputValue.length === 0 ? [] : options.filter(o => o.toLowerCase().includes(inputValue.toLowerCase())).slice(0, 12);

  function commit(finalValue) {
    onChange(finalValue);
    setDraft(null);
    setOpen(false);
    setActiveIdx(-1);
  }

  function select(opt) {
    commit(opt);
  }

  // Resolve the current draft at a non-selection commit point (Enter / blur).
  function resolveDraft() {
    if (draft === null) { setOpen(false); setActiveIdx(-1); return; }
    const trimmed = draft.trim();
    const canonical = options.find(o => o.toLowerCase() === trimmed.toLowerCase());
    if (canonical) {
      commit(canonical);              // exact match (any case) → canonical option string
    } else if (trimmed === '') {
      commit('');                     // cleared a slot
    } else if (allowFreeText) {
      commit(trimmed);                // custom item — free text is a feature here
    } else {
      setDraft(null);                 // unknown text in a constrained field → revert
      setOpen(false);
      setActiveIdx(-1);
    }
  }

  function handleChange(e) {
    setDraft(e.target.value);
    setOpen(true);
    setActiveIdx(-1);
  }

  function handleFocus() {
    selectingRef.current = false;
    if (inputValue.length > 0) setOpen(true);
  }

  function handleBlur() {
    if (selectingRef.current) { selectingRef.current = false; return; }
    resolveDraft();
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      if (open || draft !== null) e.preventDefault();
      setDraft(null);                 // cancel the edit, keep the committed value
      setOpen(false);
      setActiveIdx(-1);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (open && activeIdx >= 0 && activeIdx < filtered.length) select(filtered[activeIdx]);
      else if (open && filtered.length > 0) select(filtered[0]);   // top match
      else resolveDraft();            // no dropdown match → revert / free-text
      return;
    }
    if (!open || filtered.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIdx(i => Math.min(i + 1, filtered.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIdx(i => Math.max(i - 1, 0));
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
        value={inputValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
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
              onMouseDown={() => { selectingRef.current = true; select(opt); }}
              onTouchStart={e => {
                const t = e.touches[0];
                touchStartRef.current = { x: t.clientX, y: t.clientY };
              }}
              onTouchEnd={e => {
                const t = e.changedTouches[0];
                const s = touchStartRef.current;
                const moved = s && (Math.abs(t.clientX - s.x) > 10 || Math.abs(t.clientY - s.y) > 10);
                touchStartRef.current = null;
                if (moved) return;
                e.preventDefault();
                selectingRef.current = true;
                select(opt);
              }}
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
