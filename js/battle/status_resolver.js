/**
 * Status / Keyword Resolver
 * Manages Buffs, Debuffs, Keywords, Slot Pushing, and Duration Decrements according to rules 49~57.
 */

export const MAX_REGULAR_SLOTS = 5;

/**
 * Creates a StatusSlot object
 */
export function createStatusSlot(keywordData = {}, stack = 1, duration = 1, options = {}) {
  const rawKeywordId = keywordData.Keyword_ID || keywordData.id || 'Key_Unknown';
  const keywordId = String(rawKeywordId).replace(/^[tsaeTSAE]_/, '').trim();
  const name = keywordData.Keyword_Name || keywordData.name || keywordId;
  const isDebuff = (keywordData.Keyword_Type === '디버프' || keywordData.type === 'DEBUFF' || keywordData.category === 'DEBUFF');
  const category = isDebuff ? 'DEBUFF' : 'BUFF';
  const isImmortal = Boolean(keywordData.Keyword_Immortal === '불멸' || keywordData.Keyword_Immortal === '1' || keywordData.isImmortal);
  const isPower = (keywordData.Keyword_Stack_Type === '파워' || keywordData.isPower);
  const maxStack = Number(keywordData.Keyword_MAX || keywordData.maxStack) || 99;

  let icon = keywordData.Keyword_Icon || keywordData.icon;
  if (!icon || icon === '🔻' || icon === '🔼' || icon === '▼') {
    const KNOWN_ICONS = {
      'Key_001': '🩸', 'Key_002': '💔', 'Key_003': '💧', 'Key_004': '🔥',
      'Key_005': '⚡', 'Key_006': '❄️', 'Key_007': '🌪️', 'Key_008': '🌱',
      'Key_009': '☀️', 'Key_010': '🌙', 'Key_011': '🎆', 'Key_012': '☠️',
      'Key_013': '💫', 'Key_014': '💤', 'Key_015': '🕸️', 'Key_016': '🔇',
      'Key_017': '🔒', 'Key_018': '🛡️', 'Key_019': '⚔️', 'Key_020': '🩹',
      'Key_021': '🧪', 'Key_022': '💎', 'Key_023': '♻️', 'Key_024': '🔮',
      'Key_025': '👁️', 'Key_026': '🎯', 'Key_027': '💎', 'Key_028': '🕊️',
      'Key_039': '🃏', 'Key_040': '🎰', 'Key_041': '💣', 'Key_042': '⚓',
      'Key_047': '🎲', 'Key_051': '❓', 'Key_052': '🌑', 'Key_053': '🌓',
      'Key_054': '🌕', 'Key_055': '🌘'
    };
    const KNOWN_NAME_ICONS = {
      '원소': '🔥', '면역': '💎', '출혈': '🩸', '파괴': '💔', '중독': '☠️', '흑마법': '🎆',
      '다이스': '🎲', '슬롯머신': '🎰', '해적출항': '⚓', '수수께끼': '❓', '폭탄': '💣',
      '불사': '🕊️', '타로': '🃏', '반격': '♻️'
    };
    icon = KNOWN_ICONS[keywordId] || KNOWN_NAME_ICONS[name] || (isDebuff ? '🔻' : '🔼');
  }

  return {
    keywordId: keywordId,
    name: name,
    icon: icon,
    category: category, // 'BUFF' | 'DEBUFF'
    type: category,
    stack: (() => {
      const parsedStack = Number(stack);
      const minAllowed = (String(rawKeywordId).includes('047') || String(rawKeywordId).includes('049') || String(rawKeywordId).includes('052') || options.allowZero || ['다이스', '영혼수확', '초승'].includes(name)) ? 0 : 1;
      return (!isNaN(parsedStack) && parsedStack >= minAllowed) ? Math.min(maxStack, parsedStack) : 1;
    })(),
    duration: Math.max(1, Number(duration) || 1),
    isImmortal: isImmortal,
    isPower: isPower,
    maxStack: maxStack,
    justApplied: true, // Do not decrement duration in the same turn it was applied
    snapshotHp: Number(options?.snapshotHp) || 0,
    rawKeyword: keywordData
  };
}

/**
 * Adds or refreshes a keyword status on a character.
 */
export function applyStatus(character, keywordData, stack = 1, duration = 1, options = {}) {
  if (!character || character.isDead || character.hp <= 0) return null;

  let resultSlot = null;
  const rawKeywordId = keywordData.Keyword_ID || keywordData.id || '';
  const cleanKeywordId = String(rawKeywordId).replace(/^[tsaeTSAE]_/, '').trim();
  const kwName = keywordData.Keyword_Name || keywordData.name || '';
  const keywordId = cleanKeywordId || kwName;
  const parsedStack = Number(stack);
  const minAllowed = (cleanKeywordId.includes('047') || cleanKeywordId.includes('049') || cleanKeywordId.includes('052') || options.allowZero || ['다이스', '영혼수확', '초승'].includes(kwName)) ? 0 : 1;
  let effectiveStack = (!isNaN(parsedStack) && parsedStack >= minAllowed) ? parsedStack : 1;
  const isDebuff = (keywordData.Keyword_Type === '디버프' || keywordData.type === 'DEBUFF' || keywordData.category === 'DEBUFF');

  // Key_027: Immunity (면역) - Completely prevents acquiring debuffs
  if (isDebuff && Array.isArray(character.statusSlots)) {
    const hasImmunity = character.statusSlots.some(s => {
      const sId = String(s.keywordId || '').replace(/^[tsaeTSAE]_/, '').trim();
      return sId === 'Key_027' || s.name === '면역';
    });
    if (hasImmunity) return null;
  }

  // Key_027: Acquiring Immunity cleanses all currently applied debuffs (Item 6)
  const isImmunityKeyword = (cleanKeywordId === 'Key_027' || kwName === '면역' || keywordData.Keyword_Name === '면역');
  if (isImmunityKeyword && Array.isArray(character.statusSlots)) {
    for (let i = character.statusSlots.length - 1; i >= 0; i--) {
      const s = character.statusSlots[i];
      if (s.category === 'DEBUFF' || s.type === 'DEBUFF' || s.rawKeyword?.Keyword_Type === '디버프') {
        const [removed] = character.statusSlots.splice(i, 1);
        handleStatusRemoved(character, removed, 'CLEANSED', options);
      }
    }
  }

  // 저항력% 단순 가산(Additive) 계산: 기본 저항력 + 상태이상 저항력% 모디파이어 (Key_035 사쿠라 +50%, Key_056 간파 -50% 등)
  let totalResistance = Number(character.reg ?? character.resistance ?? 0);
  if (Array.isArray(character.statusSlots)) {
    for (const slot of character.statusSlots) {
      const raw = slot.rawKeyword || {};
      const mult = slot.isPower ? (slot.stack || 1) : 1;
      for (let i = 1; i <= 5; i++) {
        const targetType = raw[`Keyword_Stat_Target_${i}`];
        const rawVal = raw[`Keyword_Stat_Value_${i}`];
        if ((targetType === '저항력%' || targetType === '저항력') && rawVal !== undefined && rawVal !== '') {
          const num = Number(rawVal);
          if (!isNaN(num)) {
            totalResistance += num * mult;
          }
        }
      }
    }
  }
  const targetReg = Math.max(0, Math.min(100, totalResistance));

  // Section 112: Independent resistance check per stack for debuffs
  if (isDebuff && targetReg > 0 && options.rng) {
    let passed = 0;
    for (let i = 0; i < effectiveStack; i++) {
      if (!options.rng.chance(targetReg, true)) {
        passed++;
      }
    }
    effectiveStack = passed;
    if (effectiveStack <= 0) return null; // All stacks resisted
  }

  // Section 60, 61: Break Max increase Keyword
  if (keywordData.isBreakMax || keywordData.Keyword_Stat_Target_1 === '브레이킹' || keywordData.Keyword_Stat_Target_1 === '최대브레이크') {
    applyBreakMaxBonus(character, effectiveStack);
  }

  // Section: Purify (정화) Keyword Handling
  // [정화 획득 시 스택만큼의 디버프를 제거합니다. 발동 후 즉시 정화는 소멸합니다.]
  // (디버프 제거는 1스택/1턴 차감이 아닌 디버프 1종 완전 제거이며, 가장 상단에 있는 디버프를 대상으로 함)
  const isPurify = (keywordData.Keyword_ID === 'Key_057' || keywordData.Keyword_Name === '정화' || keywordData.name === '정화');
  if (isPurify) {
    let clearedCount = 0;
    const removedDebuffs = [];
    for (let i = 0; i < effectiveStack; i++) {
      const topDebuffIndex = character.statusSlots.findIndex(s =>
        s.category === 'DEBUFF' || s.type === 'DEBUFF' || s.rawKeyword?.Keyword_Type === '디버프'
      );
      if (topDebuffIndex !== -1) {
        const [removed] = character.statusSlots.splice(topDebuffIndex, 1);
        removedDebuffs.push(removed);
        handleStatusRemoved(character, removed, 'CLEANSED', options);
        clearedCount++;
      } else {
        break;
      }
    }
    return {
      isPurify: true,
      clearedCount,
      removedDebuffs,
      stack: effectiveStack,
      name: '정화',
      keywordId: 'Key_057'
    };
  }


  const existingIndex = character.statusSlots.findIndex(s => {
    const sCleanId = String(s.keywordId || '').replace(/^[tsaeTSAE]_/, '').trim();
    return (cleanKeywordId && sCleanId === cleanKeywordId) || (kwName && s.name === kwName);
  });

  if (existingIndex !== -1) {
    // 54. Duplicate Keyword Refresh (Rule 42~46 & User spec)
    // - 새 부여 스택값이 기존 스택보다 작음 : 기존 스택에 +1
    // - 새 부여 스택값이 기존 스택보다 큼 : 새 스택값으로 변경
    // - 새 지속시간이 기존 지속시간보다 작음 : 기존 지속시간에 +1
    // - 새 지속시간이 기존 지속시간보다 큼 : 새 지속시간으로 변경
    // (2가지 조건에 해당하더라도 둘 다 동시 적용)
    const existing = character.statusSlots[existingIndex];
    const newStackVal = Number(effectiveStack) || 1;
    const newDurationVal = Number(duration) || 1;

    const maxAllowedStack = Number(existing.maxStack) || 99;
    if (newStackVal <= existing.stack) {
      existing.stack = Math.min(maxAllowedStack, existing.stack + 1);
    } else {
      existing.stack = Math.min(maxAllowedStack, newStackVal);
    }

    if (newDurationVal <= existing.duration) {
      existing.duration = existing.duration + 1;
    } else {
      existing.duration = newDurationVal;
    }

    existing.justApplied = true;

    // Move to bottom of regular slots (Rule 46)
    if (!existing.isImmortal) {
      character.statusSlots.splice(existingIndex, 1);
      character.statusSlots.push(existing);
    }
    resultSlot = existing;
  } else {
    // Brand new status slot
    const newSlot = createStatusSlot(keywordData, effectiveStack, duration, {
      snapshotHp: character.hp,
      ...options
    });
    if (newSlot.keywordId === 'Key_029' || newSlot.name === '되감기') {
      newSlot.snapshotHp = character.hp;
    }

    if (newSlot.isImmortal) {
      // Rule 50~52: Undispellable Immortal status occupies top slots
      // If total slots reach capacity (5), push out a regular status
      if (character.statusSlots.length >= MAX_REGULAR_SLOTS) {
        pushOutSlot(character, newSlot.category, options);
      }
      // Place right after existing immortals at the top
      const lastImmortalIndex = character.statusSlots.reduce((lastIdx, s, idx) => s.isImmortal ? idx : lastIdx, -1);
      character.statusSlots.splice(lastImmortalIndex + 1, 0, newSlot);
      resultSlot = newSlot;
    } else {
      // Regular slot (Rule 49: Slot Pushing if total slots >= 5)
      if (character.statusSlots.length >= MAX_REGULAR_SLOTS) {
        pushOutSlot(character, newSlot.category, options);
      }
      character.statusSlots.push(newSlot);
      resultSlot = newSlot;
    }
  }

  // Key_042: 해적출항 (⚓) - [ 💦 젖음 ] 을 부여할 때 마다 1스택 획득 (해당 키워드를 이미 보유한 캐릭터만 획득)
  const isWet = (cleanKeywordId === 'Key_010' || kwName === '젖음');
  const caster = options.caster || options.attacker;
  if (isWet && caster && !caster.isDead && caster.hp > 0) {
    const curPirateSlot = Array.isArray(caster.statusSlots) && caster.statusSlots.find(s => {
      const sId = String(s.keywordId || '').replace(/^[tsaeTSAE]_/, '').trim();
      return sId === 'Key_042' || s.name === '해적출항';
    });
    if (curPirateSlot) {
      const nextPirateStack = Math.min(999, (curPirateSlot.stack || 0) + 1);
      applyStatus(caster, {
        Keyword_ID: 'Key_042',
        Keyword_Name: '해적출항',
        Keyword_Icon: '⚓',
        Keyword_Type: '버프',
        Keyword_Stack_Type: '파워',
        isImmortal: true,
        Keyword_MAX: 999,
        Keyword_Stat_Target_1: '치명타%',
        Keyword_Stat_Value_1: 2,
        Keyword_Stat_Target_2: '치명타피해량%',
        Keyword_Stat_Value_2: 4
      }, nextPirateStack, 999, { rng: options.rng });
    }
  }

  return resultSlot;
}

/**
 * Pushes out an existing regular status slot based on category preference.
 * First tries opposing category, then falls back to oldest non-immortal of same category (FIFO).
 * Returns true if a slot was pushed, false otherwise.
 */
function pushOutSlot(character, incomingCategory, options = {}) {
  // 1. If incoming is BUFF, first try to push oldest non-immortal DEBUFF.
  //    If incoming is DEBUFF, first try to push oldest non-immortal BUFF.
  const opposingCategory = incomingCategory === 'BUFF' ? 'DEBUFF' : 'BUFF';
  let removeIndex = character.statusSlots.findIndex(s => !s.isImmortal && s.category === opposingCategory);

  // 2. If no opposing category exists (e.g. all 5 slots are buffs), push oldest non-immortal of same category (FIFO)
  if (removeIndex === -1) {
    removeIndex = character.statusSlots.findIndex(s => !s.isImmortal && s.category === incomingCategory);
  }

  // 3. Fallback to any non-immortal slot
  if (removeIndex === -1) {
    removeIndex = character.statusSlots.findIndex(s => !s.isImmortal);
  }

  if (removeIndex !== -1) {
    const [removedSlot] = character.statusSlots.splice(removeIndex, 1);
    handleStatusRemoved(character, removedSlot, 'PUSHED_OUT', options);
    return true;
  }
  return false;
}

/**
 * Decrements duration of all active statuses at team turn start.
 */
export function decrementTeamStatuses(team) {
  if (!team || !team.characters) return;

  for (const char of team.characters) {
    if (char.isDead) continue;

    // Key_018: Regeneration (재생) - 매 턴 스택당 최대체력의 5% 회복
    const regenSlot = (char.statusSlots || []).find(s => s.keywordId === 'Key_018' || s.name === '재생');
    if (regenSlot && regenSlot.stack > 0) {
      applyHealing({
        target: char,
        percent: 5 * regenSlot.stack
      });
    }

    // Natural shield decay (Section 40)
    if (char.shield > 0) {
      char.shield = Math.floor(char.shield / 2);
    }

    // Decrement durations
    const nextSlots = [];
    for (const slot of char.statusSlots) {
      if (slot.justApplied) {
        slot.justApplied = false;
        nextSlots.push(slot);
        continue;
      }

      slot.duration -= 1;
      if (slot.duration > 0) {
        nextSlots.push(slot);
      } else {
        handleStatusRemoved(char, slot, 'EXPIRED', { team, rng: team.rng });
      }
    }
    char.statusSlots = nextSlots;
  }
}

/**
 * Handles status removal / expiration triggers (Key_029, Key_030, Key_046, Key_041 등).
 * 
 * @param {CharacterBattleState} character
 * @param {StatusSlot} slot
 * @param {'EXPIRED'|'PUSHED_OUT'|'CLEANSED'} reason
 * @param {Object} options
 */
export function handleStatusRemoved(character, slot, reason, options = {}) {
  if (!character || !slot) return;
  const kwId = slot.keywordId;
  const name = slot.name;

  // Key_029: 되감기 (⌚) - 만료(EXPIRED) 시 획득 시점 체력으로 강제 복구 (사망 시 부활 안함)
  if (kwId === 'Key_029' || name === '되감기') {
    if (reason === 'EXPIRED' && !character.isDead && character.hp > 0) {
      const snap = slot.snapshotHp !== undefined ? slot.snapshotHp : character.hp;
      character.hp = Math.min(character.maxHp, Math.max(1, snap));
    }
  }

  // Key_030: 비정상 식사 (🍖) - 만료, 밀어내기, 정화 시 최대 체력 50% 회복
  if (kwId === 'Key_030' || name === '비정상 식사') {
    if (reason === 'EXPIRED' || reason === 'PUSHED_OUT' || reason === 'CLEANSED') {
      applyHealing({ target: character, percent: 50 });
    }
  }

  // Key_046: 버섯 (🍄) - 제거(만료, 밀어내기, 정화) 시 80% 확률로 30% 회복 / 20% 확률로 30% 마법 피해
  if (kwId === 'Key_046' || name === '버섯') {
    if (reason === 'EXPIRED' || reason === 'PUSHED_OUT' || reason === 'CLEANSED') {
      let roll = 0.5;
      if (options.rng && typeof options.rng.next === 'function') {
        roll = options.rng.next();
      } else if (options.rng && typeof options.rng.chance === 'function') {
        roll = options.rng.chance(80, true) ? 0.1 : 0.9;
      } else {
        roll = Math.random();
      }

      if (roll < 0.8) {
        applyHealing({ target: character, percent: 30 });
      } else {
        const magicDmg = Math.round((character.maxHp || 1000) * 0.3);
        character.hp = Math.max(0, character.hp - magicDmg);
      }
    }
  }

  // Key_041: 폭탄 (💣) - 만료 시 포메이션 좌우 인접 아군에게 20% 마법 피해 + 원소 4/1 부여
  if (kwId === 'Key_041' || name === '폭탄') {
    if (reason === 'EXPIRED') {
      const team = options.team || character.team;
      if (team && Array.isArray(team.characters)) {
        const centerPos = character.formationPosition;
        const adjacentAllies = team.characters.filter(c =>
          !c.isDead && c.hp > 0 && Math.abs(c.formationPosition - centerPos) === 1
        );
        for (const ally of adjacentAllies) {
          const dmg = Math.round((ally.maxHp || 1000) * 0.2);
          ally.hp = Math.max(0, ally.hp - dmg);
          applyStatus(ally, {
            Keyword_ID: 'Key_004',
            Keyword_Name: '원소',
            Keyword_Type: '디버프',
            Keyword_Stack_Type: '스택',
            Keyword_MAX: 10
          }, 4, 1, options);
        }
      }
    }
  }
}

/**
 * Shield Renewal (Section 41): Replaces if higher, never stacks.
 */
export function applyShield(character, amount) {
  if (!character || character.isDead) return 0;
  const newShield = Math.max(0, Number(amount) || 0);
  if (newShield > character.shield) {
    character.shield = newShield;
  }
  return character.shield;
}

/**
 * Break Max Increase (Section 60, 61)
 * Simultaneously increases Current Break and Max Break.
 * If applied to a Breaking character, immediately cures Breaking.
 */
export function applyBreakMaxBonus(character, amount) {
  if (!character || character.isDead) return;
  const amt = Math.max(1, Number(amount) || 1);
  if (character.isBreaking) {
    character.isBreaking = false;
    character.breakingTurnsRemaining = 0;
  }
  character.maxBreak = (character.maxBreak || 5) + amt;
  character.currentBreak = (character.currentBreak || 0) + amt;
}

/**
 * HP Recovery / Healing (Section 72, 73)
 * Supports fixed amount and/or Target Max HP percentage.
 * Clamped to Max HP. Does not crit or use damage modifiers.
 * Applies sequential categorized healing modifiers.
 */
export function applyHealing({ target, amount = 0, percent = 0, modifiers = [] }) {
  if (!target || target.isDead || target.hp <= 0) return 0;
  let baseHeal = Number(amount) || 0;
  if (percent > 0) {
    baseHeal += Math.round(((target.maxHp || 1000) * percent) / 100);
  }
  const categories = {};
  if (Array.isArray(modifiers)) {
    for (const mod of modifiers) {
      if (!mod) continue;
      const cat = mod.category || 'GENERAL';
      categories[cat] = (categories[cat] || 0) + (Number(mod.value) || 0);
    }
  }
  let modMult = 1.0;
  for (const cat of Object.keys(categories)) {
    modMult *= Math.max(0, 1 + categories[cat]);
  }

  // Key_005: Poison (중독) - 받는 회복량 50% 감소
  if (Array.isArray(target.statusSlots) && target.statusSlots.some(s => s.keywordId === 'Key_005' || s.name === '중독')) {
    modMult *= 0.5;
  }

  const finalHeal = Math.max(0, Math.round(baseHeal * modMult));
  const prevHp = target.hp;
  target.hp = Math.min(target.maxHp, target.hp + finalHeal);
  return target.hp - prevHp;
}
