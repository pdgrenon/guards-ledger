import { useState } from 'react';
import { SATCHEL_SIZE, SATCHEL_EXPANDED_SIZE, GUARD_COLOR_MAP } from '../data/constants';
import { ALL_MATERIALS, WEAPONS, ARMOR, ACCESSORIES, EQUIPPABLE_ITEMS, WEAPON_STATS, ARMOR_STATS, satchelStackLimit } from '../data/materials';
import { Autocomplete } from './Autocomplete';
import { MAX_TALENT_BONUS } from '../hooks/gameReducers';

const EQUIPMENT_SLOTS = [
  { key: 'weapon',    label: 'Weapon',    options: WEAPONS    },
  { key: 'armor',     label: 'Armor',     options: ARMOR      },
  { key: 'accessory', label: 'Accessory', options: ACCESSORIES },
  // EQUIPPABLE_ITEMS, not ITEMS: the foods are usable items too (AVE-548).
  { key: 'item',      label: 'Item',      options: EQUIPPABLE_ITEMS },
];

const GUARD_ROLES = {
  Grigory:   'The Tactician',
  Alek:      'The Apothecary',
  Catherine: 'The Remnant',
  Yury:      'The Marauder',
  Kharzin:   'The Sentinel',
  Vera:      'The Vanguard',
  Pavel:     'The Watchman',
  Yana:      'The Prophet',
};

// Place portrait files in public/guards/ named exactly as below (e.g. grigory.webp).
// The component falls back to initials automatically if the file is missing.
const BASE = '/guards/';
const GUARD_IMAGES = {
  Grigory:   `${BASE}grigory.webp`,
  Alek:      `${BASE}alek.webp`,
  Catherine: `${BASE}catherine.webp`,
  Yury:      `${BASE}yury.webp`,
  Kharzin:   `${BASE}kharzin.webp`,
  Vera:      `${BASE}vera.webp`,
  Pavel:     `${BASE}pavel.webp`,
  Yana:      `${BASE}yana.webp`,
};

function initials(name) { return name.slice(0, 2).toUpperCase(); }

function GuardAvatar({ name, colorKey }) {
  const src = GUARD_IMAGES[name];
  // Track WHICH portrait failed, not merely that one did. GuardPanel is not
  // remounted when the player switches between the two active guards (same
  // position in the tree, no key), so a bare boolean stuck at `true` and every
  // guard viewed afterwards fell back to initials — including the seven whose
  // portraits load fine. One slow or blocked request (offline before the
  // service worker precached `public/guards/`) took out the portraits for the
  // whole session.
  const [failedSrc, setFailedSrc] = useState(null);
  const failed = failedSrc !== null && failedSrc === src;

  // Render initials instead of fighting React's DOM ownership when the
  // portrait is missing — a state toggle keeps the node fully React-managed.
  if (failed || !src) {
    return <div className={`guard-avatar ${colorKey}`}>{initials(name)}</div>;
  }

  return (
    <div className={`guard-avatar ${colorKey}`} style={{ padding: 0, overflow: 'hidden' }}>
      <img
        src={src}
        alt={name}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', borderRadius: 'inherit' }}
        onError={() => setFailedSrc(src)}
      />
    </div>
  );
}

export function GuardPanel({ guard, guardIdx, actions }) {
  const {
    adjustGuardHp,
    adjustGuardTalent,
    setGuardEquipment,
    setGuardSatchelItem,
    toggleExpandedSatchel,

  } = actions;

  const satchelSize = guard.expandedSatchel ? SATCHEL_EXPANDED_SIZE : SATCHEL_SIZE;

  // Derive color key from the shared map; fall back to 'gold' if guard name is unknown.
  const colorKey = GUARD_COLOR_MAP[guard.name]?.key ?? 'gold';
  const role     = GUARD_ROLES[guard.name] ?? 'Guard';

  // Which stat's talent stepper is open. Scoped to the guard by name:
  // GuardPanel is not remounted when switching guards, so a bare stat key
  // would leave the stepper open on the next guard too.
  const [talentEdit, setTalentEdit] = useState(null);
  const editingStat = talentEdit?.guard === guard.name ? talentEdit.stat : null;
  const toggleTalentEdit = stat =>
    setTalentEdit(editingStat === stat ? null : { guard: guard.name, stat });

  const weaponBonus = WEAPON_STATS[guard.equipment.weapon] ?? 0;
  const armorBonus  = ARMOR_STATS[guard.equipment.armor]  ?? 0;
  const combatStats = [
    { stat: 'atk', label: 'Attack',  base: guard.baseAtk ?? 0, talent: guard.talentAtk ?? 0, gear: weaponBonus, gearLabel: 'weapon' },
    { stat: 'def', label: 'Defense', base: guard.baseDef ?? 0, talent: guard.talentDef ?? 0, gear: armorBonus,  gearLabel: 'armor' },
  ];

  return (
    <div className="card guard-card">
      {/* Header */}
      <div className="guard-header">
        <GuardAvatar name={guard.name} colorKey={colorKey} />
        <div>
          <div className="guard-name">{guard.name}</div>
          <div className="guard-role">{role}</div>
        </div>
      </div>

      {/* Health */}
      <div className="sec-label-primary">Health</div>
      <div className="stat-row">
        <div className="stat-name">HP</div>
        <div className="hp-display">
          <span className="hp-current">{guard.hp}</span>
          <span className="hp-sep">/</span>
          <span className="hp-max">{guard.maxHp}</span>
        </div>
        {/* HP always steps by 1. There used to be a 1/5/10 step selector here,
            but ±1 is the only step the table ever used, and squeezing three
            more buttons into this row is what collapsed them to 9px wide. The
            Sil/Lux steppers in StashTab keep theirs — craft costs run to 75
            Sil, so ×5/×10 earns its keep there. */}
        <div className="adj-pair">
          <button className="stat-adj-btn adj-btn-sm minus" onClick={() => adjustGuardHp(guardIdx, -1)}
            aria-label={`Decrease ${guard.name} HP by 1`}>−</button>
          <button className="stat-adj-btn adj-btn-sm plus" onClick={() => adjustGuardHp(guardIdx, 1)}
            aria-label={`Increase ${guard.name} HP by 1`}>+</button>
        </div>
      </div>

      <div className="divider" />

      {/* Combat Stats */}
      <div className="sec-label-primary">Combat stats</div>
      <div className="combat-stats-grid">
        {combatStats.map(({ stat, label, base, talent, gear, gearLabel }) => {
          const parts = [`${base} base`];
          if (talent > 0) parts.push(`${talent} talent`);
          if (gear > 0)   parts.push(`${gear} ${gearLabel}`);
          const open = editingStat === stat;
          return (
            <div className="combat-stat-box" key={stat}>
              {/* Tapping the stat reveals the talent-bonus stepper. Talents
                  that raise a stat are rare and permanent, so the control
                  stays out of sight until someone needs it. */}
              <button
                type="button"
                className="combat-stat-toggle"
                onClick={() => toggleTalentEdit(stat)}
                aria-expanded={open}
                aria-label={`${label} ${base + talent + gear}. ${open ? 'Hide' : 'Edit'} ${guard.name} talent bonus`}
              >
                <span className="combat-stat-label">{label}</span>
                <span className="combat-stat-value-row">
                  <span className="combat-stat-value">{base + talent + gear}</span>
                </span>
                {parts.length > 1 && (
                  <span className="combat-stat-breakdown">{parts.join(' + ')}</span>
                )}
              </button>
              {open && (
                <div className="talent-edit-row">
                  <span className="talent-edit-label">Talent bonus</span>
                  <button className="adj-btn adj-btn-sm minus" onClick={() => adjustGuardTalent(guardIdx, stat, -1)}
                    disabled={talent <= 0}
                    aria-label={`Decrease ${guard.name} talent ${label} bonus`}>−</button>
                  <span className="adj-val">{talent}</span>
                  <button className="adj-btn adj-btn-sm plus" onClick={() => adjustGuardTalent(guardIdx, stat, 1)}
                    disabled={talent >= MAX_TALENT_BONUS}
                    aria-label={`Increase ${guard.name} talent ${label} bonus`}>+</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="divider" />

      {/* Equipment */}
      <div className="sec-label-primary">Equipment</div>
      <div className="equip-grid mb-2">
        {EQUIPMENT_SLOTS.map(({ key, label, options }) => (
          // Keyed by guard as well as slot. GuardPanel is rendered in a fixed
          // position with no key of its own, so switching the displayed guard
          // reuses these instances — and Autocomplete holds an uncommitted
          // `draft` in local state. Without the guard in the key, a party change
          // arriving from a co-player mid-edit would swap the guard underneath a
          // live draft while onChange rebound to the new guardIdx, committing
          // typed text onto a guard the player never touched.
          <div key={`${guard.name}-${key}`} className="equip-slot">
            <div className="equip-lbl">{label}</div>
            <Autocomplete
              value={guard.equipment[key]}
              onChange={val => setGuardEquipment(guardIdx, key, val)}
              options={options}
              placeholder="— empty —"
              ariaLabel={`${label} — ${guard.name}`}
            />
          </div>
        ))}
      </div>

      <div className="divider" />

      {/* Satchel */}
      <div className="flex items-center justify-between mb-2">
        <div className="sec-label-primary" style={{ marginBottom: 0 }}>Satchel</div>
        <button
          type="button"
          className="flex items-center gap-1 satchel-toggle"
          style={{ touchAction: 'manipulation' }}
          onClick={() => toggleExpandedSatchel(guardIdx)}
          role="switch"
          aria-checked={guard.expandedSatchel}
          aria-label="Expanded satchel"
        >
          <div className={`toggle ${guard.expandedSatchel ? 'on' : ''}`} style={{ width: 34, height: 20 }}>
            <div className="toggle-thumb" style={{ width: 13, height: 13, top: 2, left: 2 }} />
          </div>
          <span className="text-xs text-muted">Expanded</span>
        </button>
      </div>

      <div className={`satchel-grid${guard.expandedSatchel ? ' satchel-expanded' : ''}`}>
        {Array(satchelSize).fill(0).map((_, si) => {
          const slot = guard.satchel[si] || { item: '', qty: 1 };
          return (
            // Keyed by guard as well as slot — see the equipment grid above.
            <div key={`${guard.name}-${si}`} className="satchel-slot">
              <Autocomplete
                value={slot.item}
                onChange={val => setGuardSatchelItem(guardIdx, si, 'item', val)}
                options={ALL_MATERIALS}
                placeholder="empty"
                ariaLabel={`Satchel slot ${si + 1} — ${guard.name}`}
              />
              {slot.item && (
                <div className="satchel-qty-row">
                <button className="satchel-qty-btn minus" onClick={() => {
                    if (slot.qty <= 1) setGuardSatchelItem(guardIdx, si, 'item', '');
                    else setGuardSatchelItem(guardIdx, si, 'qty', slot.qty - 1);
                  }} aria-label={`Decrease ${slot.item || 'satchel item'} quantity`}>−</button>
                  <span className="satchel-qty-val">×{slot.qty}</span>
                  <button className="satchel-qty-btn plus"
                    disabled={slot.qty >= satchelStackLimit(slot.item)}
                    onClick={() => setGuardSatchelItem(guardIdx, si, 'qty', Math.min(satchelStackLimit(slot.item), slot.qty + 1))} aria-label={`Increase ${slot.item || 'satchel item'} quantity`}>+</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {!guard.expandedSatchel && (() => {
        const hiddenCount = (guard.satchel ?? []).slice(SATCHEL_SIZE).reduce((sum, s) => sum + (s.item ? (s.qty || 1) : 0), 0);
        if (hiddenCount === 0) return null;
        return <div className="text-xs text-muted mt-1">{hiddenCount} {hiddenCount === 1 ? 'item' : 'items'} stored in expanded slots</div>;
      })()}

    </div>
  );
}
