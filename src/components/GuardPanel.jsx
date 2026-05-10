import { CHIP_TYPES, SATCHEL_SIZE, SATCHEL_EXPANDED_SIZE } from '../data/constants';
import { ALL_MATERIALS, WEAPONS, ARMOR, ACCESSORIES, ITEMS, WEAPON_STATS, ARMOR_STATS } from '../data/materials';
import { Autocomplete } from './Autocomplete';

const EQUIPMENT_SLOTS = [
  { key: 'weapon',    label: 'Weapon',    options: WEAPONS    },
  { key: 'armor',     label: 'Armor',     options: ARMOR      },
  { key: 'accessory', label: 'Accessory', options: ACCESSORIES },
  { key: 'item',      label: 'Item',      options: ITEMS      },
];

// Fixed per-guard colors — persistent visual identity
const GUARD_COLORS = {
  Alek:    'purple',
  Grigory: 'amber',
  Dasha:   'green',
  Zoya:    'red',
  Borya:   'amber',
  Mila:    'purple',
  Seva:    'green',
  Kira:    'red',
};
const FALLBACK_COLORS = ['purple', 'amber', 'green', 'red'];

function initials(name) {
  return name.slice(0, 2).toUpperCase();
}

export function GuardPanel({ guard, guardIdx, actions }) {
  const {
    adjustGuardHp,
    setGuardEquipment,
    setGuardSatchelItem,
    toggleExpandedSatchel,
    adjustChip,
    resetChips,
  } = actions;

  const satchelSize = guard.expandedSatchel ? SATCHEL_EXPANDED_SIZE : SATCHEL_SIZE;
  const color = GUARD_COLORS[guard.name] ?? FALLBACK_COLORS[guardIdx % FALLBACK_COLORS.length];

  const weaponBonus = WEAPON_STATS[guard.equipment.weapon] ?? 0;
  const armorBonus  = ARMOR_STATS[guard.equipment.armor]  ?? 0;
  const totalAtk = (guard.baseAtk ?? 0) + weaponBonus;
  const totalDef = (guard.baseDef ?? 0) + armorBonus;

  return (
    <div className="card guard-card">
      {/* Header */}
      <div className="guard-header">
        <div className={`guard-avatar ${color}`}>{initials(guard.name)}</div>
        <div>
          <div className="guard-name">{guard.name}</div>
          <div className="text-hint" style={{ fontSize: 11 }}>Guard · active</div>
        </div>
      </div>

      {/* Health */}
      <div className="sec-label">Health</div>
      <div className="stat-row">
        <div className="stat-name">HP</div>
        <div className="pip-track">
          {Array(guard.maxHp).fill(0).map((_, i) => (
            <div key={i} className={`pip${i < guard.hp ? ' hp' : ''}`} />
          ))}
        </div>
        <div className="adj-val stat-fraction">{guard.hp}/{guard.maxHp}</div>
        <div className="adj-pair">
          <button className="stat-adj-btn adj-btn-sm" onClick={() => adjustGuardHp(guardIdx, -1)}>−</button>
          <button className="stat-adj-btn adj-btn-sm" onClick={() => adjustGuardHp(guardIdx, 1)}>+</button>
        </div>
      </div>

      <div className="divider" />

      {/* Combat Stats */}
      <div className="sec-label">Combat stats</div>
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
      <div className="sec-label">Equipment</div>
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
        <div className="sec-label" style={{ marginBottom: 0 }}>Satchel</div>
        <div
          className="flex items-center gap-1"
          style={{ cursor: 'pointer', touchAction: 'manipulation' }}
          onClick={() => toggleExpandedSatchel(guardIdx)}
        >
          <div className={`toggle ${guard.expandedSatchel ? 'on' : ''}`} style={{ width: 34, height: 20 }}>
            <div className="toggle-thumb" style={{ width: 13, height: 13, top: 2, left: 2 }} />
          </div>
          <span className="text-xs text-muted">Expanded</span>
        </div>
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
                  <button className="satchel-qty-btn" onClick={() => setGuardSatchelItem(guardIdx, si, 'qty', Math.max(1, slot.qty - 1))}>−</button>
                  <span className="satchel-qty-val">×{slot.qty}</span>
                  <button className="satchel-qty-btn" onClick={() => setGuardSatchelItem(guardIdx, si, 'qty', Math.min(4, slot.qty + 1))}>+</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="divider" />

      {/* Chip Bag */}
      <div className="sec-label">Chip Bag</div>
      <div className="chips-grid">
        {CHIP_TYPES.map(({ id, label, color: chipColor }) => (
          <div key={id} className={`chip-row ${chipColor}`}>
            <span className="chip-name">{label}</span>
            <div className="chip-controls">
              <button className="chip-btn" onClick={() => adjustChip(guardIdx, id, -1)}>−</button>
              <span className="chip-count">{guard.chips[id] ?? 0}</span>
              <button className="chip-btn" onClick={() => adjustChip(guardIdx, id, 1)}>+</button>
            </div>
          </div>
        ))}
      </div>
      <button className="end-battle-btn" onClick={() => resetChips(guardIdx)}>
        Reset chips · black → {guard.startingBlack}
      </button>
    </div>
  );
}
