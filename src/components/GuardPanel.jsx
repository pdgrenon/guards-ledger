import { CHIP_TYPES, SATCHEL_SIZE, SATCHEL_EXPANDED_SIZE } from '../data/constants';
import { ALL_MATERIALS, WEAPONS, ARMOR, ACCESSORIES, ITEMS, WEAPON_STATS, ARMOR_STATS } from '../data/materials';
import { Autocomplete } from './Autocomplete';

const EQUIPMENT_SLOTS = [
  { key: 'weapon', label: 'Weapon', options: WEAPONS },
  { key: 'armor', label: 'Armor', options: ARMOR },
  { key: 'accessory', label: 'Accessory', options: ACCESSORIES },
  { key: 'item', label: 'Item', options: ITEMS },
];
const AVATAR_COLORS = ['purple', 'amber'];

function initials(name) {
  return name.slice(0, 2).toUpperCase();
}

export function GuardPanel({ guard, guardIdx, actions }) {
  const {
    adjustGuardHp, adjustGuardAp, setGuardEquipment,
    setGuardSatchelItem, toggleExpandedSatchel,
    useStone, adjustChip, endBattle, adjustTempDef,
  } = actions;

  const satchelSize = guard.expandedSatchel ? SATCHEL_EXPANDED_SIZE : SATCHEL_SIZE;
  const color = AVATAR_COLORS[guardIdx % AVATAR_COLORS.length];

  const weaponBonus = WEAPON_STATS[guard.equipment.weapon] ?? 0;
  const armorBonus = ARMOR_STATS[guard.equipment.armor] ?? 0;
  const totalAtk = (guard.baseAtk ?? 0) + weaponBonus;
  const totalDef = (guard.baseDef ?? 0) + armorBonus;
  const tempDef = guard.tempDef ?? 0;

  return (
    <div className="card">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2" style={{ paddingBottom: 10, borderBottom: '0.5px solid var(--c-border)' }}>
        <div className={`guard-avatar ${color}`}>{initials(guard.name)}</div>
        <div>
          <div className="font-medium" style={{ fontSize: 14 }}>{guard.name}</div>
          <div className="text-hint" style={{ fontSize: 11 }}>Guard · active</div>
        </div>
      </div>

      {/* HP & AP */}
      <div className="sec-label">Health &amp; AP</div>

      <div className="stat-row">
        <div className="stat-name">HP</div>
        <div className="pip-track">
          {Array(guard.maxHp).fill(0).map((_, i) => (
            <div key={i} className={`pip${i < guard.hp ? ' hp' : ''}`} />
          ))}
        </div>
        <div className="adj-val" style={{ fontSize: 12 }}>{guard.hp}/{guard.maxHp}</div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="stat-adj-btn" onClick={() => adjustGuardHp(guardIdx, -1)}>−</button>
          <button className="stat-adj-btn" onClick={() => adjustGuardHp(guardIdx, 1)}>+</button>
        </div>
      </div>

      <div className="stat-row">
        <div className="stat-name">AP</div>
        <div className="pip-track">
          {Array(5).fill(0).map((_, i) => <div key={i} className={`pip${i < guard.apGray ? ' ap-gray' : ''}`} />)}
        </div>
        <div className="stat-type">gray</div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="stat-adj-btn" onClick={() => adjustGuardAp(guardIdx, 'gray', -1)}>−</button>
          <button className="stat-adj-btn" onClick={() => adjustGuardAp(guardIdx, 'gray', 1)}>+</button>
        </div>
      </div>

      <div className="stat-row">
        <div className="stat-name"></div>
        <div className="pip-track">
          {Array(5).fill(0).map((_, i) => <div key={i} className={`pip${i < guard.apTemp ? ' ap-green' : ''}`} />)}
        </div>
        <div className="stat-type">temp</div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="stat-adj-btn" onClick={() => adjustGuardAp(guardIdx, 'temp', -1)}>−</button>
          <button className="stat-adj-btn" onClick={() => adjustGuardAp(guardIdx, 'temp', 1)}>+</button>
        </div>
      </div>

      <div className="divider" />

      {/* Combat Stats */}
      <div className="sec-label">Combat stats</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
        <div style={{ background: 'var(--c-surface2)', border: '0.5px solid var(--c-border)', borderRadius: 'var(--radius-md)', padding: '7px 10px' }}>
          <div style={{ fontSize: 10, color: 'var(--c-text3)', marginBottom: 3 }}>Attack</div>
          <div style={{ fontSize: 20, fontWeight: 500, color: 'var(--c-text)', lineHeight: 1 }}>{totalAtk}</div>
          {weaponBonus > 0 && (
            <div style={{ fontSize: 10, color: 'var(--c-text3)', marginTop: 2 }}>
              {guard.baseAtk} base + {weaponBonus} weapon
            </div>
          )}
        </div>
        <div style={{ background: 'var(--c-surface2)', border: '0.5px solid var(--c-border)', borderRadius: 'var(--radius-md)', padding: '7px 10px' }}>
          <div style={{ fontSize: 10, color: 'var(--c-text3)', marginBottom: 3 }}>Defense</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 20, fontWeight: 500, color: 'var(--c-text)', lineHeight: 1 }}>{totalDef}</span>
            {tempDef > 0 && (
              <span style={{ fontSize: 14, fontWeight: 500, color: '#185FA5', lineHeight: 1 }}>+{tempDef}</span>
            )}
          </div>
          {armorBonus > 0 && (
            <div style={{ fontSize: 10, color: 'var(--c-text3)', marginTop: 2 }}>
              {guard.baseDef} base + {armorBonus} armor
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 5 }}>
            <span style={{ fontSize: 10, color: '#185FA5' }}>Temp. defense</span>
            <div style={{ display: 'flex', gap: 2, marginLeft: 'auto' }}>
              <button className="chip-btn" style={{ borderColor: '#185FA5', color: '#185FA5' }} onClick={() => adjustTempDef(guardIdx, -1)}>−</button>
              <span style={{ fontSize: 12, fontWeight: 500, color: '#185FA5', minWidth: 18, textAlign: 'center' }}>{tempDef}</span>
              <button className="chip-btn" style={{ borderColor: '#185FA5', color: '#185FA5' }} onClick={() => adjustTempDef(guardIdx, 1)}>+</button>
            </div>
          </div>
        </div>
      </div>

      <div className="divider" />
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

      <div className="satchel-grid" style={{ gridTemplateColumns: `repeat(${guard.expandedSatchel ? 4 : 4}, 1fr)` }}>
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

      {/* Speaking Stones */}
      <div className="sec-label">Speaking Stones</div>
      <div className="stones-row">
        {guard.stones.map((stone, si) => (
          <div
            key={si}
            className={`stone-pill ${stone.state}`}
            onClick={() => useStone(guardIdx, si)}
          >
            <div className="stone-dot" />
            {stone.state === 'ready' ? 'Ready' : 'Cooling'}
          </div>
        ))}
      </div>
      <div className="stone-hint">Tap ready to use · tap cooling to undo · cooling becomes ready after 1 full round</div>

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
      <button className="end-battle-btn" onClick={() => endBattle(guardIdx)}>
        End battle · reset black chips to {guard.startingBlack}
      </button>
    </div>
  );
}
