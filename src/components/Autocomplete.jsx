import { useState, useRef, useEffect } from 'react';

export function Autocomplete({ value, onChange, options, placeholder, className }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value || '');
  const [prevValue, setPrevValue] = useState(value);
  const ref = useRef(null);

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
  }

  function handleChange(e) {
    setQuery(e.target.value);
    onChange(e.target.value);
    setOpen(true);
  }

  function handleBlur() {
    setTimeout(() => setOpen(false), 150);
  }

  return (
    <div className={`autocomplete-wrap ${className || ''}`} ref={ref}>
      <input
        className="autocomplete-input"
        value={query}
        onChange={handleChange}
        onFocus={() => query.length > 0 && setOpen(true)}
        onBlur={handleBlur}
        placeholder={placeholder || 'Search…'}
        autoComplete="off"
        autoCorrect="off"
        spellCheck="false"
      />
      {open && filtered.length > 0 && (
        <div className="autocomplete-dropdown">
          {filtered.map(opt => (
            <div key={opt} className="autocomplete-option" onMouseDown={() => select(opt)} onTouchEnd={() => select(opt)}>
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
