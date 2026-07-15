import { useState } from 'react';
import { SATCHEL_SIZE, SATCHEL_EXPANDED_SIZE, GUARD_COLOR_MAP } from '../data/constants';
import { ALL_MATERIALS, WEAPONS, ARMOR, ACCESSORIES, ITEMS, WEAPON_STATS, ARMOR_STATS, satchelStackLimit } from '../data/materials';
import { Autocomplete } from './Autocomplete';

const EQUIPMENT_SLOTS = [
  { key: 'weapon',    label: 'Weapon',    options: WEAPONS    },
  { key: 'armor',     label: 'Armor',     options: ARMOR      },
  { key: 'accessory', label: 'Accessory', options: ACCESSORIES },
  { key: 'item',      label: 'Item',      options: ITEMS      },
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
  const [failed, setFailed] = useState(false);

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
        onError={() => setFailed(true)}
      />
    </div>
  );
}

export function GuardPanel({ guard, guardIdx, actions }) {
  const {
    adjustGuardHp,
    setGuardEquipment,
    setGuardSatchelItem,
    toggleExpandedSatchel,

  } = actions;

  const satchelSize = guard.expandedSatchel ? SATCHEL_EXPANDED_SIZE : SATCHEL_SIZE;

  // Derive color key from the shared map; fall back to 'gold' if guard name is unknown.
  const colorKey = GUARD_COLOR_MAP[guard.name]?.key ?? 'gold';
  const role     = GUARD_ROLES[guard.name] ?? 'Guard';

  const weaponBonus = WEAPON_STATS[guard.equipment.weapon] ?? 0;
  const armorBonus  = ARMOR_STATS[guard.equipment.armor]  ?? 0;
  const totalAtk = (guard.baseAtk ?? 0) + weaponBonus;
  const totalDef = (guard.baseDef ?? 0) + armorBonus;

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
        <div className="adj-pair">
          <button className="stat-adj-btn adj-btn-sm minus" onClick={() => adjustGuardHp(guardIdx, -1)} aria-label={`Decrease ${guard.name} HP`}>−</button>
          <button className="stat-adj-btn adj-btn-sm plus"  onClick={() => adjustGuardHp(guardIdx, 1)} aria-label={`Increase ${guard.name} HP`}>+</button>
        </div>
      </div>

      <div className="divider" />

      {/* Combat Stats */}
      <div className="sec-label-primary">Combat stats</div>
      <div className="combat-stats-grid">
        <div className="combat-stat-box">
          <div className="combat-stat-label">Attack</div>
          <div className="combat-stat-value-row">
            <div className="combat-stat-value">{totalAtk}</div>
          </div>
          {weaponBonus > 0 && (
            <div className="combat-stat-breakdown">
              {guard.baseAtk} base + {weaponBonus} weapon
            </div>
          )}
        </div>
        <div className="combat-stat-box">
          <div className="combat-stat-label">Defense</div>
          <div className="combat-stat-value-row">
            <div className="combat-stat-value">{totalDef}</div>
          </div>
          {armorBonus > 0 && (
            <div className="combat-stat-breakdown">
              {guard.baseDef} base + {armorBonus} armor
            </div>
          )}
        </div>
      </div>

      <div className="divider" />

      {/* Equipment */}
      <div className="sec-label-primary">Equipment</div>
      <div className="equip-grid mb-2">
        {EQUIPMENT_SLOTS.map(({ key, label, options }) => (
          <div key={key} className="equip-slot">
            <div className="equip-lbl">{label}</div>
            <Autocomplete
              value={guard.equipment[key]}
              onChange={val => setGuardEquipment(guardIdx, key, val)}
              options={options}
              placeholder="— empty —"
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
            <div key={si} className="satchel-slot">
              <Autocomplete
                value={slot.item}
                onChange={val => setGuardSatchelItem(guardIdx, si, 'item', val)}
                options={ALL_MATERIALS}
                placeholder="empty"
              />
              {slot.item && (
                <div className="satchel-qty-row">
                <button className="satchel-qty-btn minus" onClick={() => {
                    if (slot.qty <= 1) setGuardSatchelItem(guardIdx, si, 'item', '');
                    else setGuardSatchelItem(guardIdx, si, 'qty', slot.qty - 1);
                  }} aria-label={`Decrease ${slot.item || 'satchel item'} quantity`}>−</button>
                  <span className="satchel-qty-val">×{slot.qty}</span>
                  <button className="satchel-qty-btn plus"  onClick={() => setGuardSatchelItem(guardIdx, si, 'qty', Math.min(satchelStackLimit(slot.item), slot.qty + 1))} aria-label={`Increase ${slot.item || 'satchel item'} quantity`}>+</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {!guard.expandedSatchel && (() => {
        const hiddenCount = (guard.satchel ?? []).slice(4).reduce((sum, s) => sum + (s.item ? (s.qty || 1) : 0), 0);
        if (hiddenCount === 0) return null;
        return <div className="text-xs text-muted mt-1">{hiddenCount} {hiddenCount === 1 ? 'item' : 'items'} stored in expanded slots</div>;
      })()}

    </div>
  );
}
