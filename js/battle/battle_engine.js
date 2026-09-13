/**
 * Battle Engine Orchestrator
 * Implements core combat state machine, tick progression, turn flow,
 * card play, damage execution, death resolution, counter phase, and win/deadlock checks.
 */

import { BattlePhase, CardType, CharacterClass, CharacterRole, DamageType, createBattleState } from './battle_types.js';
import { BattleRNG } from './prng.js';
import { decrementTeamStatuses, applyStatus, applyHealing, applyShield } from './status_resolver.js';
import { resolveTargets } from './target_resolver.js';
import { calculateAndApplyDamage } from './damage_resolver.js';
import { buildTeamDeck, drawCards, resolveHandCardUse, handleCharacterDeathCards, getCardOverheat, isCardPlayable, transformUniqueToUltimate } from './card_deck.js';
import { selectAICardAndTarget } from './ai_resolver.js';

export const TAROT_CARDS = [
  { id: 'TAROT_FOOL', name: '바보 (The Fool)', desc: '아군의 다음 턴 드로우 2장 감소', target: 'TEAM', effect: { drawDeltaNextTurn: -2 } },
  { id: 'TAROT_STRENGTH', name: '힘 (Strength)', desc: '아군 근거리 딜러의 공격력 10% 증가', target: 'ROLE', targetRole: CharacterRole.MELEE_DPS, roleName: '근거리 딜러', effect: { atkPercent: 10 } },
  { id: 'TAROT_MAGICIAN', name: '마술사 (The Magician)', desc: '아군 마법 딜러의 아이돌력 10% 증가', target: 'ROLE', targetRole: CharacterRole.MAGIC_DPS, roleName: '마법 딜러', effect: { idolPercent: 10 } },
  { id: 'TAROT_HERMIT', name: '은자 (The Hermit)', desc: '아군 암살자의 공격력 10% 증가', target: 'ROLE', targetRole: CharacterRole.ASSASSIN, roleName: '암살자', effect: { atkPercent: 10 } },
  { id: 'TAROT_TOWER', name: '탑 (The Tower)', desc: '아군 원거리 딜러의 공격력 10% 증가', target: 'ROLE', targetRole: CharacterRole.RANGED_DPS, roleName: '원거리 딜러', effect: { atkPercent: 10 } },
  { id: 'TAROT_HIEROPHANT', name: '교황 (The Hierophant)', desc: '아군 힐러의 아이돌력 10% 증가', target: 'ROLE', targetRole: CharacterRole.HEALER, roleName: '힐러', effect: { idolPercent: 10 } },
  { id: 'TAROT_LOVERS', name: '연인 (The Lovers)', desc: '아군 버퍼의 아이돌력 10% 증가', target: 'ROLE', targetRole: CharacterRole.BUFFER, roleName: '버퍼', effect: { idolPercent: 10 } },
  { id: 'TAROT_JUSTICE', name: '정의 (Justice)', desc: '아군 디버퍼의 아이돌력 10% 증가', target: 'ROLE', targetRole: CharacterRole.DEBUFFER, roleName: '디버퍼', effect: { idolPercent: 10 } },
  { id: 'TAROT_CHARIOT', name: '전차 (The Chariot)', desc: '아군 탱커의 방어력 및 마법방어력 7 증가', target: 'ROLE', targetRole: CharacterRole.TANK, roleName: '탱커', effect: { defDelta: 7, mdefDelta: 7 } },
  { id: 'TAROT_DEVIL', name: '악마 (The Devil)', desc: '자신에게 [ 🩸 출혈 1 / 5 ] 부여', target: 'SELF', keywordId: 'Key_001', keywordName: '출혈', stack: 1, duration: 5 },
  { id: 'TAROT_DEATH', name: '사신 (Death)', desc: '자신에게 [ 🎆 흑마법 1 / 5 ] 부여', target: 'SELF', keywordId: 'Key_011', keywordName: '흑마법', stack: 1, duration: 5 },
  { id: 'TAROT_HANGED_MAN', name: '매달린 사람 (The Hanged Man)', desc: '자신에게 [ 💔 파괴 1 / 5 ] 부여', target: 'SELF', keywordId: 'Key_002', keywordName: '파괴', stack: 1, duration: 5 }
];

export class BattleEngine {
  constructor(teamA, teamB, options = {}) {
    const seed = options.seed || Date.now();
    this.rng = new BattleRNG(seed);
    this.skillsMasterMap = options.skillsMasterMap || {};
    this.keywordsMasterMap = options.keywordsMasterMap || {};
    this.teamA = teamA;
    this.teamB = teamB;
    this.manualPlayerPass = Boolean(options.manualPlayerPass);
    this.state = createBattleState(teamA, teamB, seed);
    this.eventListeners = [];
  }

  log(message) {
    const entry = `[Tick ${this.state.currentTick}] ${message}`;
    this.state.battleLog.push(entry);
    this.emit('log', entry);
  }

  executeForcedTurnEnd(team) {
    this.log('사용할 수 있는 카드가 없습니다. (강제 턴 종료)');
    resolveHandCardUse(team, { cardId: 'NONE' });
    team.currentTurnOverheat = 0;
    team.nextTurnRequirement = 200;
    this.endTurn(team);
  }

  on(event, callback) {
    this.eventListeners.push({ event, callback });
  }

  emit(event, data) {
    for (const listener of this.eventListeners) {
      if (listener.event === event) {
        try {
          listener.callback(data);
        } catch (e) {
          console.error(`Error in battle event listener [${event}]:`, e);
        }
      }
    }
  }

  getCharacterById(charId) {
    if (!this.state) return null;
    const all = [...(this.state.teamA?.characters || []), ...(this.state.teamB?.characters || [])];
    return all.find(c => c.characterId === charId) || null;
  }

  /**
   * Rule 10: Battle Initialization
   */
  initBattle() {
    this.state.battlePhase = BattlePhase.INITIALIZING;
    this.log('전투 초기화 시작');

    // 0. Set team references
    for (const c of this.state.teamA.characters) c.team = this.state.teamA;
    for (const c of this.state.teamB.characters) c.team = this.state.teamB;
    this.state.teamA.opponentTeam = this.state.teamB;
    this.state.teamB.opponentTeam = this.state.teamA;

    // 1. Reset gauges & requirements
    this.state.teamA.teamGauge = 0;
    this.state.teamA.turnRequirement = 200;
    this.state.teamA.nextTurnRequirement = 200;
    this.state.teamA.currentTurnOverheat = 0;

    this.state.teamB.teamGauge = 0;
    this.state.teamB.turnRequirement = 200;
    this.state.teamB.nextTurnRequirement = 200;
    this.state.teamB.currentTurnOverheat = 0;

    // 2. Build 36-card decks
    this.state.teamA.deck = buildTeamDeck(this.state.teamA, this.skillsMasterMap, this.rng);
    this.state.teamA.discard = [];
    this.state.teamA.exhaust = [];
    this.state.teamA.hand = [];

    this.state.teamB.deck = buildTeamDeck(this.state.teamB, this.skillsMasterMap, this.rng);
    this.state.teamB.discard = [];
    this.state.teamB.exhaust = [];
    this.state.teamB.hand = [];

    // 3. Battle Start Effects (Rule 11)
    this.state.battlePhase = BattlePhase.BATTLE_START;
    this._executeBattleStartEffects();

    // 4. Start first tick
    this.state.battlePhase = BattlePhase.TICK_RUNNING;
    this.log('전투 개시! 첫 번째 틱 준비 완료');
  }

  /**
   * Rule 11: Battle Start Effects execution sorted by Speed DESC, then Position ASC.
   */
  _executeBattleStartEffects() {
    const allChars = [...this.state.teamA.characters, ...this.state.teamB.characters];
    allChars.sort((a, b) => {
      if (b.speed !== a.speed) return b.speed - a.speed;
      return a.formationPosition - b.formationPosition;
    });

    for (const char of allChars) {
      if (char.isDead) continue;

      // Battle start passives (P_S_037 ~ P_S_045, P_S_051, P_S_060, P_S_061)
      const battleStartPassiveMap = [
        { id: 'P_S_037', name: '스텔라', key: 'Key_034', kwName: '일등성', icon: '🌟', stack: 1, duration: 999, immortal: true },
        { id: 'P_S_038', name: '후부킹덤', key: 'Key_037', kwName: '위엄', icon: '👑', stack: 1, duration: 999, immortal: true },
        { id: 'P_S_039', name: '유비유비', key: 'Key_038', kwName: '폭력', icon: '🥊', stack: 1, duration: 999, immortal: true },
        { id: 'P_S_040', name: '타로로 엿보는 미래', key: 'Key_039', kwName: '점괘', icon: '🔮', stack: 1, duration: 1, immortal: false },
        { id: 'P_S_041', name: '행운토끼', key: 'Key_040', kwName: '슬롯머신', icon: '🎰', stack: 1, duration: 999, immortal: true },
        { id: 'P_S_042', name: 'Ahoy', key: 'Key_042', kwName: '해적출항', icon: '⚓', stack: 1, duration: 999, immortal: true },
        { id: 'P_S_043', name: '혼돈의 주사위', key: 'Key_047', kwName: '다이스', icon: '🎲', stack: 0, duration: 999, immortal: true },
        { id: 'P_S_044', name: 'Death Reaper', key: 'Key_049', kwName: '영혼수확', icon: '💀', stack: 0, duration: 999, immortal: true },
        { id: 'P_S_045', name: '달의 여신', key: 'Key_052', kwName: '초승', icon: '🌒', stack: 0, duration: 999, immortal: true },
        { id: 'P_S_051', name: '시간 가속', key: 'Key_019', kwName: '가속', icon: '⌛', stack: 5, duration: 10, immortal: false },
        { id: 'P_S_060', name: '메스바루', key: 'Key_014', kwName: '청초', icon: '⚜️', stack: 2, duration: 12, immortal: false },
        { id: 'P_S_061', name: '벽아일체', key: 'Key_058', kwName: '벽아일체', icon: '🧱', stack: 1, duration: 999, immortal: true }
      ];

      if (Array.isArray(char.passives)) {
        for (const pEntry of battleStartPassiveMap) {
          const matched = char.passives.some(p => {
            if (!p) return false;
            const str = typeof p === 'string' ? p : (p.P_Skill_ID || p.id || p.P_Skill_Name || p.name || '');
            return str.includes(pEntry.id) || (pEntry.name && str.includes(pEntry.name));
          });
          if (matched) {
            const masterKw = this.keywordsMasterMap?.[pEntry.key] || {
              Keyword_ID: pEntry.key,
              Keyword_Name: pEntry.kwName,
              Keyword_Icon: pEntry.icon,
              Keyword_Type: '버프',
              isImmortal: pEntry.immortal,
              Keyword_MAX: pEntry.immortal ? 999 : (pEntry.key === 'Key_052' ? 10 : 99)
            };
            applyStatus(char, masterKw, pEntry.stack, pEntry.duration, { allowZero: true });
            this.log(`✨ [패시브 발동] ${char.name} 전투 시작 시 [${pEntry.kwName} ${pEntry.stack}스택 / ${pEntry.duration}턴] 획득`);
          }
        }
      }

      // Hook for passives/battle start keywords
      this.emit('characterBattleStart', char);
    }

    // Key_039: 점괘 (🔮) - 전투 시작 시 12종 타로 카드 1장 추첨 적용
    for (const team of [this.state.teamA, this.state.teamB]) {
      const fortuneChar = team.characters.find(c => !c.isDead && c.statusSlots?.some(s => s.keywordId === 'Key_039' || s.name === '점괘'));
      if (fortuneChar && !team.activeTarot) {
        const tarot = TAROT_CARDS[this.rng.nextInt(0, TAROT_CARDS.length - 1)];
        team.activeTarot = tarot;
        this.log(`🔮 [빅 갓 미온의 점괘!] ${team.teamId} 타로 카드 [${tarot.name}] 등장: ${tarot.desc}`);
        this.emit('tarotDrawn', { team, tarot, message: `🔮 [점괘] 타로 카드 '${tarot.name}' 등장! ${tarot.desc}` });

        // Immediate Tarot effects
        if (tarot.id === 'TAROT_FOOL') {
          team.tarotDrawPenalty = 2;
        } else if (tarot.target === 'SELF' && tarot.keywordId) {
          const kwData = this.keywordsMasterMap[tarot.keywordId] || {
            Keyword_ID: tarot.keywordId,
            Keyword_Name: tarot.keywordName,
            Keyword_Type: '디버프'
          };
          applyStatus(fortuneChar, kwData, tarot.stack || 1, tarot.duration || 5, { caster: fortuneChar, team, rng: this.rng });
          this.log(`🔮 [타로 효과] ${fortuneChar.name}에게 [${tarot.keywordName} ${tarot.stack}/${tarot.duration}] 부여!`);
        }
      }
    }
  }

  /**
   * Advances battle by 1 Tick (Rule 12).
   */
  advanceTick() {
    if (this.state.battlePhase === BattlePhase.BATTLE_END) return;

    this.state.currentTick += 1;
    this.emit('tick', { currentTick: this.state.currentTick });

    // Accumulate Gauge = Alive characters speed sum (Rule 12)
    const getCharSpeed = (c) => {
      let spd = (c.speed || 10) + (c.redSuperchat?.speed || 0);
      if (Array.isArray(c.statusSlots)) {
        for (const s of c.statusSlots) {
          const mult = s.isPower ? (s.stack || 1) : 1;
          const raw = s.rawKeyword || {};
          let hasSpeedTarget = false;
          for (let i = 1; i <= 5; i++) {
            if (raw[`Keyword_Stat_Target_${i}`] === '속도') {
              hasSpeedTarget = true;
              spd += (Number(raw[`Keyword_Stat_Value_${i}`]) || 0) * mult;
            }
          }
          if (!hasSpeedTarget) {
            if (s.keywordId === 'Key_007' || s.name === '압도') spd -= 2 * (s.stack || 1);
          }
          if (s.keywordId === 'Key_009' || s.name === '빙결') spd -= 3;
          if (s.keywordId === 'Key_019' || s.name === '가속') spd += 1 * (s.stack || 1);
        }
      }
      spd = Math.max(1, spd);
      return c.isBreaking ? Math.floor(spd * 0.5) : spd;
    };

    const teamASpeed = this.state.teamA.characters
      .filter(c => !c.isDead && c.hp > 0)
      .reduce((sum, c) => sum + getCharSpeed(c), 0);

    const teamBSpeed = this.state.teamB.characters
      .filter(c => !c.isDead && c.hp > 0)
      .reduce((sum, c) => sum + getCharSpeed(c), 0);

    this.state.teamA.teamGauge += teamASpeed;
    this.state.teamB.teamGauge += teamBSpeed;

    const reqA = this.state.teamA.turnRequirement;
    const reqB = this.state.teamB.turnRequirement;

    const aReady = this.state.teamA.teamGauge >= reqA;
    const bReady = this.state.teamB.teamGauge >= reqB;

    if (aReady && bReady) {
      // Rule 15: Tie-breaker
      // 1. Fewer living characters wins turn
      const livingA = this.state.teamA.characters.filter(c => !c.isDead && c.hp > 0).length;
      const livingB = this.state.teamB.characters.filter(c => !c.isDead && c.hp > 0).length;

      let winner = this.state.teamA;
      if (livingA < livingB) {
        winner = this.state.teamA;
      } else if (livingB < livingA) {
        winner = this.state.teamB;
      } else {
        // 2. Same survivors: Player Team (teamA) wins
        winner = this.state.teamA;
      }

      this._acquireTurn(winner);
    } else if (aReady) {
      this._acquireTurn(this.state.teamA);
    } else if (bReady) {
      this._acquireTurn(this.state.teamB);
    }
  }

  /**
   * Handles Turn Acquisition and Overflow (Rule 13, 14).
   */
  _acquireTurn(team) {
    this.state.currentTurnOwner = team.teamId;
    // Rule 14: Gauge Overflow carry over
    team.teamGauge -= team.turnRequirement;

    // Reset current turn requirement to base next turn requirement
    team.turnRequirement = team.nextTurnRequirement;
    team.nextTurnRequirement = 200; // default base for future
    team.currentTurnOverheat = 0;

    this.startTurn(team);
  }

  /**
   * Starts a Team Turn (Rule 16).
   */
  startTurn(team) {
    this.state.turnCount += 1;
    this.state.battlePhase = BattlePhase.TURN_START;
    this.log(`[턴 ${this.state.turnCount}] ${team.teamId} 턴 시작`);
    this.emit('turnStart', { teamId: team.teamId, turnCount: this.state.turnCount });

    const opponentTeam = (team === this.state.teamA) ? this.state.teamB : this.state.teamA;

    // 1. Decrement Buff/Debuff durations for this team (Rule 16, 53)
    decrementTeamStatuses(team);

    // Rule 58: Resolve any deaths triggered by DoT or status expiration (e.g. Bomb, Mushroom)
    this._resolveDeaths();
    if (this._checkBattleOutcome()) {
      return;
    }

    // 2. Red Superchat 판정 (Key_033 아카스파 마츠리 보유 시 12%, 기본 4% 확률) (Rule 80~85)
    let drawBonus = 0;
    if (team.redSuperchatExtraDrawTurns > 0) {
      drawBonus += 1;
      team.redSuperchatExtraDrawTurns -= 1;
      this.log(`🧧 [버퍼 아카스파 지속 효과] 추가 드로우 1장 발생 (잔여 추가 드로우: ${team.redSuperchatExtraDrawTurns}턴)`);
    }

    const hasAkaspaMatsuri = team.characters.some(c => !c.isDead && c.statusSlots?.some(s => s.keywordId === 'Key_033' || s.name === '아카스파 마츠리'));
    const akaspaChance = hasAkaspaMatsuri ? 12 : 4;

    if (this.rng.chance(akaspaChance, true)) {
      this.log(`💥 [아카스파/Red Superchat 발동!] (${team.teamId})`);
      const livingChars = team.characters.filter(c => !c.isDead && c.hp > 0);
      const breakingChars = livingChars.filter(c => c.isBreaking);

      let targetChar = null;
      let isTargetBreaking = false;
      if (breakingChars.length > 0) {
        // Breaking character priority (Rule 82, 83)
        targetChar = breakingChars[this.rng.nextInt(0, breakingChars.length - 1)];
        isTargetBreaking = true;
      } else if (livingChars.length > 0) {
        targetChar = livingChars[this.rng.nextInt(0, livingChars.length - 1)];
        isTargetBreaking = false;
      }

      if (targetChar) {
        const superchatDrawBonus = this._applyRedSuperchatRoleEffect(targetChar, isTargetBreaking, team);
        drawBonus += superchatDrawBonus;
        this.emit('redSuperchat', { team, character: targetChar, isBreaking: isTargetBreaking });
      }
    }

    // Key_047: 다이스 (🎲) - 턴 시작 시 주사위 1~6 굴림
    for (const char of team.characters) {
      if (char.isDead || char.hp <= 0) continue;
      const diceSlot = Array.isArray(char.statusSlots) && char.statusSlots.find(s => s.keywordId === 'Key_047' || s.name === '다이스');
      if (diceSlot) {
        const roll = this.rng.nextInt(1, 6);
        diceSlot.stack = roll; // Reflect roll into keyword slot stack
        if (roll === 1) {
          // <스네이크 아이>: 상태이상 전부 제거, 1턴간 면역(Key_027) 획득, 1턴간 공/아/치/회 +25%
          char.statusSlots = char.statusSlots.filter(s => s.category !== 'DEBUFF' && s.type !== 'DEBUFF');
          applyStatus(char, {
            Keyword_ID: 'Key_027',
            Keyword_Name: '면역',
            Keyword_Icon: '💎',
            Keyword_Type: '버프',
            isImmortal: true,
            Keyword_MAX: 1
          }, 1, 1);
          char.diceRoll = { value: 1, isSnakeEyes: true };
          char.isSnakeEyes = true;
          this.log(`🎲 [스네이크 아이!] ${char.name} 주사위 1! 모든 상태이상 제거, 면역 획득 및 올스탯 +25%!`);
          this.emit('diceRolled', { character: char, roll: 1, isSnakeEyes: true, message: `🎲 [스네이크 아이!] ${char.name} 스네이크 아이 발생 (1)! 디버프 제거 & 면역 + 올스탯 25%!` });
        } else {
          char.diceRoll = { value: roll, isSnakeEyes: false };
          char.isSnakeEyes = false;
          this.log(`🎲 [다이스] ${char.name} 주사위 ${roll}! 이번 턴 공격력/아이돌력 +${roll}%`);
          this.emit('diceRolled', { character: char, roll, isSnakeEyes: false, message: `🎲 [다이스 ${roll}] ${char.name} 다이스 굴림: ${roll}!` });
        }
      }
    }

    // 3. Draw Phase (Rule 18, 71)
    this.state.battlePhase = BattlePhase.DRAW;
    let tarotDrawDelta = 0;
    if (team.tarotDrawPenalty) {
      tarotDrawDelta = team.tarotDrawPenalty;
      team.tarotDrawPenalty = 0;
      this.log(`🔮 [바보 타로 효과] ${team.teamId} 이번 턴 드로우 ${tarotDrawDelta}장 감소!`);
    }
    const drawCount = Math.max(1, 3 + drawBonus - tarotDrawDelta);
    drawCards(team, drawCount, this.rng, (shuffledTeam) => {
      this.log(`🔀 [덱 셔플] ${shuffledTeam.teamId} 버려진 카드 ${shuffledTeam.deck.length}장을 덱으로 셔플했습니다.`);
      this.emit('deckShuffled', { team: shuffledTeam, teamId: shuffledTeam.teamId });
    });
    this.log(`${team.teamId} 카드 ${drawCount}장 드로우 (덱 잔여: ${team.deck.length}, 버림: ${team.discard.length})`);

    // Key_040: 슬롯머신 (🎰) - 3장 이상 등급 또는 소유자 일치 시 속공 및 오버히트 -20 (해당 턴 한정)
    const hasSlotMachine = team.characters.some(c => !c.isDead && c.statusSlots?.some(s => s.keywordId === 'Key_040' || s.name === '슬롯머신'));
    if (hasSlotMachine && team.hand.length >= 3) {
      const sameType = team.hand.every(c => c.cardType === team.hand[0].cardType);
      const sameOwner = team.hand.every(c => c.ownerCharacterId === team.hand[0].ownerCharacterId && c.ownerCharacterId !== 'NONE');
      if (sameType || sameOwner) {
        for (const card of team.hand) {
          if (!card._slotMachineBuff) {
            card._slotMachineBuff = true;
            card._originalIsQuick = card.isQuick || false;
            card.isQuick = true;
            card.bonusOverheat = (card.bonusOverheat || 0) - 20;
          }
        }
        this.log(`🎰 [슬롯머신 잭팟!] 손패의 ${sameType ? '등급' : '소유자'} 일치! 모든 손패에 <속공> 부여 및 오버히트 -20!`);
        this.emit('slotMachineJackpot', { team, message: `🎰 [슬롯머신 잭팟!] 조건 달성! 이번 턴 <속공> 부여 및 오버히트 -20!` });
      }
    }

    // Key_051: 수수께끼 (❔) - 턴마다 1~N 정답 슬롯 결정
    const hasRiddle = team.characters.some(c => !c.isDead && c.statusSlots?.some(s => s.keywordId === 'Key_051' || s.name === '수수께끼'));
    if (hasRiddle && team.hand.length > 0) {
      team.riddleCorrectSlot = this.rng.nextInt(1, team.hand.length);
    }

    // 4. Card Selection Phase (Rule 18, 46)
    this.state.battlePhase = BattlePhase.CARD_SELECTION;

    // Check if hand has any playable cards (Section 20, 21)
    const usableCards = team.hand.filter(card => isCardPlayable(card, team, opponentTeam));

    if (usableCards.length === 0) {
      if (!team.isPlayer || !this.manualPlayerPass) {
        // Section 21: Forced turn end if all drawn cards are unusable
        this.log('사용할 수 있는 카드가 없습니다. (브레이킹 등의 제약으로 턴 강제 종료)');
        resolveHandCardUse(team, { cardId: 'NONE' }); // discard all drawn cards
        team.currentTurnOverheat = 0;
        team.nextTurnRequirement = 200;
        this.endTurn(team);
        return;
      } else {
        this.log('사용할 수 있는 카드가 없습니다. (플레이어 턴 넘기기 대기)');
        this.emit('playerTurnWaiting', { team, hand: team.hand, hasPlayableCards: false });
        return;
      }
    }

    // If AI team, automatically select and execute card
    if (!team.isPlayer) {
      const { selectedCard, manualTarget } = selectAICardAndTarget({ team, opponentTeam, rng: this.rng });
      if (selectedCard) {
        this.executeCardPlay(team, selectedCard, manualTarget);
      } else {
        this.endTurn(team);
      }
    } else {
      // Player team: Emits event for UI to pick card
      this.emit('playerTurnWaiting', { team, hand: team.hand });
    }
  }

  /**
   * If game is waiting in CARD_SELECTION for an AI team (e.g. after player toggles auto-resolve),
   * automatically triggers AI card selection and execution so combat does not stall.
   */
  triggerAutoTurnIfNeeded() {
    if (this.state.battlePhase === BattlePhase.CARD_SELECTION) {
      const currentTeam = this.state.currentTurnOwner === 'TEAM_A' ? this.state.teamA : this.state.teamB;
      const opponentTeam = currentTeam.teamId === 'TEAM_A' ? this.state.teamB : this.state.teamA;
      if (!currentTeam.isPlayer) {
        const { selectedCard, manualTarget } = selectAICardAndTarget({ team: currentTeam, opponentTeam, rng: this.rng });
        if (selectedCard) {
          this.executeCardPlay(currentTeam, selectedCard, manualTarget);
        } else {
          this.endTurn(currentTeam);
        }
      }
    }
  }

  /**
   * Applies Red Superchat Role Effect based on Main Role (Rule 84).
   * Separate from regular 5-keyword slots, permanently enhances character for combat.
   */
  _applyRedSuperchatRoleEffect(char, isBreaking = false, team = null) {
    if (!char || char.isDead || char.hp <= 0) return 0;

    let drawBonus = 0;
    const role = char.mainRole;

    if (isBreaking) {
      char.isBreaking = false;
      char.breakingTurnsRemaining = 0;
      char.currentBreak = char.maxBreak;
      this.log(`💥 [아카스파 브레이킹 각성!] ${char.name}의 브레이킹 즉시 해제 및 완충 (Break: ${char.maxBreak}/${char.maxBreak})`);
    }

    let atkPct = 0;
    let idolPct = 0;
    let maxHpPct = 0;
    let defBonus = 0;
    let mdefBonus = 0;
    let speedBonus = 0;
    let accuracyPct = 0;
    let critChance = 0;
    let descText = '';

    switch (role) {
      case CharacterRole.MELEE_DPS:
        atkPct = isBreaking ? 33 : 25;
        maxHpPct = isBreaking ? 25 : 15;
        descText = isBreaking ? '공격력 +33%, 최대 HP +25%' : '공격력 +25%, 최대 HP +15%';
        break;
      case CharacterRole.RANGED_DPS:
        atkPct = isBreaking ? 33 : 25;
        accuracyPct = isBreaking ? 15 : 8;
        descText = isBreaking ? '공격력 +33%, 명중률 +15%' : '공격력 +25%, 명중률 +8%';
        break;
      case CharacterRole.MAGIC_DPS:
        idolPct = isBreaking ? 33 : 25;
        speedBonus = isBreaking ? 5 : 3;
        descText = isBreaking ? '아이돌력 +33%, 속도 +5' : '아이돌력 +25%, 속도 +3';
        break;
      case CharacterRole.TANK:
        maxHpPct = isBreaking ? 30 : 20;
        defBonus = isBreaking ? 12 : 7;
        mdefBonus = isBreaking ? 12 : 7;
        descText = isBreaking ? '최대 HP +30%, 물리/마법방어 +12' : '최대 HP +20%, 물리/마법방어 +7';
        break;
      case CharacterRole.ASSASSIN:
        atkPct = isBreaking ? 33 : 25;
        critChance = isBreaking ? 20 : 12;
        descText = isBreaking ? '공격력 +33%, 치명타율 +20%' : '공격력 +25%, 치명타율 +12%';
        break;
      case CharacterRole.HEALER:
        maxHpPct = isBreaking ? 30 : 20;
        speedBonus = isBreaking ? 5 : 3;
        descText = isBreaking ? '최대 HP +30%, 속도 +5' : '최대 HP +20%, 속도 +3';
        break;
      case CharacterRole.BUFFER:
        idolPct = isBreaking ? 33 : 25;
        drawBonus = 1;
        if (team) {
          if (isBreaking) {
            team.redSuperchatExtraDrawTurns = 1;
            descText = '아이돌력 +33%, 이번 턴과 다음 턴 드로우 +1';
          } else {
            descText = '아이돌력 +25%, 이번 턴 드로우 +1';
          }
        }
        break;
      case CharacterRole.DEBUFFER:
        idolPct = isBreaking ? 33 : 25;
        speedBonus = isBreaking ? 5 : 3;
        descText = isBreaking ? '아이돌력 +33%, 속도 +5' : '아이돌력 +25%, 속도 +3';
        break;
      default:
        atkPct = isBreaking ? 33 : 25;
        descText = isBreaking ? '공격력 +33%' : '공격력 +25%';
        break;
    }

    if (maxHpPct > 0) {
      const hpBonus = Math.round(char.maxHp * (maxHpPct / 100));
      char.maxHp += hpBonus;
      char.hp += hpBonus;
    }

    char.redSuperchat = {
      role: role,
      isBreaking: isBreaking,
      emoji: '🧧',
      name: isBreaking ? '아카스파 (브레이킹 각성)' : '아카스파 (응원)',
      description: descText,
      atkPct,
      idolPct,
      maxHpPct,
      def: defBonus,
      mdef: mdefBonus,
      speed: speedBonus,
      accuracyPct,
      critChance
    };

    this.log(`🧧 [아카스파 부여] ${char.name}(${role})에게 [${char.redSuperchat.name}: ${descText}] 적용 (키워드 슬롯 미소모)`);
    return drawBonus;
  }

  /**
   * Executes a played card's resolution sequence (Rule 20, 21, 22).
   */
  executeCardPlay(team, card, manualTarget = null) {
    if (!card) return;

    this.state.battlePhase = BattlePhase.CARD_RESOLUTION;
    const opponentTeam = (team === this.state.teamA) ? this.state.teamB : this.state.teamA;
    const owner = team.characters.find(c => c.characterId === card.ownerCharacterId);

    // Rule 62, 63, 65: Accumulate Overheat
    const cardOverheat = getCardOverheat(card, owner);
    team.currentTurnOverheat += cardOverheat;
    if (card.cardType === CardType.ULTIMATE && owner) {
      owner.ultimateUseCount = (owner.ultimateUseCount || 0) + 1;
    }

    this.log(`카드 사용: [${card.skillName}] (소유자: ${owner ? owner.name : '없음'}, Overheat: ${cardOverheat})`);
    this.emit('cardPlayed', { team, card, owner, cardOverheat });

    // Key_038: 폭력 (🥊) - 스킬 사용 시마다 해당 스킬 카드의 오버히트 -10
    if (owner && !owner.isDead && Array.isArray(owner.statusSlots)) {
      const violenceSlot = owner.statusSlots.find(s => s.keywordId === 'Key_038' || s.name === '폭력');
      if (violenceSlot) {
        card.bonusOverheat = (card.bonusOverheat || 0) - 10;
        this.log(`🥊 [폭력 발동] ${owner.name}의 [${card.skillName}] 카드 오버히트 -10 누적 감소! (현재 보너스: ${card.bonusOverheat})`);
        this.emit('violenceTriggered', { character: owner, card, bonusOverheat: card.bonusOverheat });
      }
    }

    // Key_051: 수수께끼 (❔) 슬롯 번호 판정
    const playedSlot = team.hand.findIndex(c => c.cardId === card.cardId) + 1;
    if (owner && !owner.isDead && Array.isArray(owner.statusSlots)) {
      const riddleSlot = owner.statusSlots.find(s => s.keywordId === 'Key_051' || s.name === '수수께끼');
      if (riddleSlot && team.riddleCorrectSlot && playedSlot > 0) {
        if (playedSlot === team.riddleCorrectSlot) {
          applyHealing({ target: owner, percent: 33 });
          this.log(`❔ [수수께끼 정답!] ${owner.name}의 ${playedSlot}번 카드 선택 적중! 최대 체력의 33% 회복!`);
          this.emit('riddleResult', { character: owner, isCorrect: true, slot: playedSlot, message: `❔ [수수께끼 정답!] ${owner.name}의 33% 체력 회복!` });
        } else {
          const riddleDmg = Math.round((owner.maxHp || 1000) * 0.1);
          owner.hp = Math.max(0, owner.hp - riddleDmg);
          applyStatus(owner, { Keyword_ID: 'Key_006', Keyword_Name: '행동불가', Keyword_Type: '디버프' }, 1, 2, { rng: this.rng });
          this.log(`❔ [수수께끼 오답!] ${owner.name}의 ${playedSlot}번 카드 선택 실패(정답: ${team.riddleCorrectSlot}번). 10% 마법피해(-${riddleDmg}) 및 2턴 행동불가 부여!`);
          this.emit('riddleResult', { character: owner, isCorrect: false, slot: playedSlot, message: `❔ [수수께끼 오답!] ${owner.name}에게 10% 마법피해 및 2턴 행동불가!` });
          this.emit('damage', {
            attacker: null,
            target: owner,
            amount: riddleDmg,
            hpDamage: riddleDmg,
            shieldDamage: 0,
            isCritical: false,
            damageType: 'MAGIC',
            isHit: true
          });
        }
      }
    }

    // [달이 차오릅니다 +1] 효과 감지 및 달 시리즈 키워드 승급/만월 변환
    const isMoonSkill = (card.skillId === 'B_S_409' ||
      String(card.skillName || '').includes('달이 차오릅니다') ||
      String(card.rawSkill?.Skill_Desc || '').includes('달이 차오릅니다'));
    if (isMoonSkill && owner && !owner.isDead) {
      this._advanceMoonPhase(team, owner);
    }

    // Key_005: Poison (중독 - 행동 시 스택당 최대체력의 10% 만큼 마법피해)
    if (owner && !owner.isDead && Array.isArray(owner.statusSlots)) {
      const poisonSlot = owner.statusSlots.find(s => s.keywordId === 'Key_005' || s.name === '중독');
      if (poisonSlot && poisonSlot.stack > 0) {
        const poisonDmg = Math.round((owner.maxHp * 0.10) * poisonSlot.stack);
        owner.hp = Math.max(0, owner.hp - poisonDmg);
        this.log(`☢️ [중독 피해] ${owner.name} 카드 사용으로 인한 중독 마법피해 -${poisonDmg} HP (남은 HP: ${owner.hp}/${owner.maxHp})`);
        this.emit('damage', {
          attacker: null,
          target: owner,
          amount: poisonDmg,
          hpDamage: poisonDmg,
          shieldDamage: 0,
          isCritical: false,
          damageType: 'MAGIC',
          isHit: true,
          isPoison: true
        });
      }
    }

    // Skill Effect Sequence Execution (Rule 22)
    const skillData = card.rawSkill || {};
    const isCurseOrMemorial = (card.cardType === CardType.MEMORIAL || card.cardType === CardType.CURSE || card.skillId === 'B_S_001' || card.skillId === 'B_S_014');
    const attacker = isCurseOrMemorial ? (owner && !owner.isDead && owner.hp > 0 ? owner : (team.characters.find(c => !c.isDead && c.hp > 0) || owner)) : owner;
    this._resolveSkillEffects({
      team,
      opponentTeam,
      attacker,
      card,
      skillData,
      manualTarget
    });

    // Handle Card Discard / Exhaust (Rule 18, 61)
    resolveHandCardUse(team, card);

    // Death Resolution (Rule 58)
    this._resolveDeaths();

    // Counter Phase (Rule 66)
    this._resolveCounterPhase();

    // Check Win/Loss & Deadlock (Rule 78, 79, 80)
    if (this._checkBattleOutcome()) {
      return;
    }

    // Quick Card Check (Skill_Tags '속공'): keep turn active if remaining playable cards exist
    if (card.isQuick && team.hand.some(c => isCardPlayable(c, team, opponentTeam))) {
      this.log(`⚡ [속공 발동] ${card.skillName} 사용 후 턴이 연장됩니다! (남은 패: ${team.hand.length}장)`);
      this.emit('quickCardPlayed', { team, card });
      this.state.battlePhase = BattlePhase.CARD_SELECTION;
      if (team.isPlayer) {
        this.emit('playerTurnWaiting', { team, hand: team.hand, isQuickExtraTurn: true });
        return;
      } else {
        const next = selectAICardAndTarget({ team, opponentTeam, rng: this.rng });
        if (next && next.selectedCard) {
          this.executeCardPlay(team, next.selectedCard, next.manualTarget);
          return;
        }
      }
    }

    // End Turn
    this.endTurn(team);
  }

  /**
   * Advances moon progression (초승 ➔ 반월 ➔ 상현 ➔ 만월) and transforms Unique cards upon reaching Full Moon.
   */
  _advanceMoonPhase(team, character) {
    if (!character || character.isDead) return;
    const moonKeywords = ['Key_052', 'Key_053', 'Key_054', 'Key_055'];
    let moonSlot = (character.statusSlots || []).find(s => moonKeywords.includes(s.keywordId) || ['초승', '반월', '상현', '만월'].includes(s.name));

    if (!moonSlot) {
      moonSlot = applyStatus(character, {
        Keyword_ID: 'Key_052',
        Keyword_Name: '초승',
        Keyword_Icon: '🌒',
        Keyword_Type: '버프',
        isImmortal: true,
        Keyword_MAX: 10
      }, 1, 999);
    } else {
      moonSlot.stack = Math.min(10, moonSlot.stack + 1);
    }

    const curStack = moonSlot.stack;
    if (curStack >= 10) {
      if (moonSlot.keywordId !== 'Key_055') {
        moonSlot.keywordId = 'Key_055';
        moonSlot.name = '만월';
        moonSlot.icon = '🌕';
        moonSlot.rawKeyword = { Keyword_ID: 'Key_055', Keyword_Name: '만월', Keyword_Icon: '🌕', Keyword_Type: '버프', isImmortal: true, Keyword_MAX: 10 };
        transformUniqueToUltimate(team, character.characterId, this.skillsMasterMap);
        this.log(`🌕 [만월 도달!] ${character.name}의 달이 완전히 차올라(10스택) 모든 고유기 카드가 궁극기로 변환되었습니다!`);
        this.emit('moonPhaseChanged', { character, phase: '만월', message: `🌕 [만월 도달!] ${character.name}의 모든 고유기가 궁극기로 승급!` });
      }
    } else if (curStack >= 7) {
      if (moonSlot.keywordId !== 'Key_054') {
        moonSlot.keywordId = 'Key_054';
        moonSlot.name = '상현';
        moonSlot.icon = '🌔';
        moonSlot.rawKeyword = { Keyword_ID: 'Key_054', Keyword_Name: '상현', Keyword_Icon: '🌔', Keyword_Type: '버프', isImmortal: true, Keyword_MAX: 10 };
        this.log(`🌔 [상현 달성!] ${character.name}의 달이 상현으로 승급했습니다. (스택: ${curStack})`);
        this.emit('moonPhaseChanged', { character, phase: '상현', message: `🌔 [상현 달성!] ${character.name}의 달이 차오릅니다 (스택: ${curStack})` });
      }
    } else if (curStack >= 4) {
      if (moonSlot.keywordId !== 'Key_053') {
        moonSlot.keywordId = 'Key_053';
        moonSlot.name = '반월';
        moonSlot.icon = '🌓';
        moonSlot.rawKeyword = { Keyword_ID: 'Key_053', Keyword_Name: '반월', Keyword_Icon: '🌓', Keyword_Type: '버프', isImmortal: true, Keyword_MAX: 10 };
        this.log(`🌓 [반월 달성!] ${character.name}의 달이 반월로 승급했습니다. (스택: ${curStack})`);
        this.emit('moonPhaseChanged', { character, phase: '반월', message: `🌓 [반월 달성!] ${character.name}의 달이 차오릅니다 (스택: ${curStack})` });
      }
    }
  }

  /**
   * Helper to retrieve normalized Action data (Act 1 or Act 2)
   */
  _getActData(skillData, actNum) {
    if (skillData[`act${actNum}`]) {
      const a = skillData[`act${actNum}`];
      return {
        ...a,
        k1Id: a.k1Id || a.key1Id,
        k1V1: a.k1V1 !== undefined ? a.k1V1 : a.key1Val1,
        k1V2: a.k1V2 !== undefined ? a.k1V2 : a.key1Val2,
        k2Id: a.k2Id || a.key2Id,
        k2V1: a.k2V1 !== undefined ? a.k2V1 : a.key2Val1,
        k2V2: a.k2V2 !== undefined ? a.k2V2 : a.key2Val2
      };
    }
    const prefix = `Act${actNum}_`;
    if (skillData[`${prefix}Type`]) {
      const cleanKw = (raw) => String(raw || '').replace(/^[tsaeTSAE]_/, '').trim();
      return {
        type: skillData[`${prefix}Type`],
        target: skillData[`${prefix}Target`],
        method: skillData[`${prefix}Target_Method`],
        range: skillData[`${prefix}Range`],
        count: Number(skillData[`${prefix}Target_Count`]) || 1,
        calc: skillData[`${prefix}Calc_Base`] || '공격력',
        multiplier: Number(skillData[`${prefix}Multiplier`]) || 0,
        breakDmg: Number(skillData[`${prefix}Break`]) || 0,
        k1Id: cleanKw(skillData[`${prefix}Key_1_ID`]),
        k1V1: skillData[`${prefix}Key_1_Val1`],
        k1V2: skillData[`${prefix}Key_1_Val2`],
        k2Id: cleanKw(skillData[`${prefix}Key_2_ID`]),
        k2V1: skillData[`${prefix}Key_2_Val1`],
        k2V2: skillData[`${prefix}Key_2_Val2`]
      };
    }
    return null;
  }

  /**
   * Applies a single keyword status to a target character
   */
  _applyActionKeyword(t, attacker, team, opponentTeam, kwId, val1, val2) {
    if (!t || t.isDead || t.hp <= 0 || !kwId) return;
    const cleanId = String(kwId).replace(/^[tsaeTSAE]_/, '').trim();
    const kw = this.keywordsMasterMap[cleanId] || this.keywordsMasterMap[kwId] || {
      Keyword_ID: cleanId,
      Keyword_Name: cleanId,
      Keyword_Type: '버프'
    };
    const s1 = Number(val1) || 1;
    const s2 = Number(val2) || 1;
    const statusRes = applyStatus(t, kw, s1, s2, { caster: attacker, attacker, team, opponentTeam, rng: this.rng });
    if (statusRes && statusRes.isPurify) {
      this.log(`💠 [정화 발동] ${t.name}의 상단 디버프 ${statusRes.clearedCount}개 완전 제거!`);
      this.emit('status_cleansed', { caster: attacker, target: t, clearedCount: statusRes.clearedCount, keyword: kw });
    } else if (statusRes) {
      this.log(`상태 부여 [${kw.Keyword_Name || cleanId}] ${statusRes.stack} (${statusRes.duration}턴) -> ${t.name}`);
      this.emit('status_applied', { caster: attacker, target: t, keyword: kw, stack: statusRes.stack, duration: statusRes.duration });
    }
  }

  /**
   * Executes a single normalized action (Act1 or Act2)
   */
  _executeSingleAction({ team, opponentTeam, attacker, card, actionData, manualTarget, executionContext }) {
    if (!actionData || actionData.type === 'NONE') return;

    let targetPool;
    const tgt = actionData.target;
    const isActionManual = (actionData.method === '수동' || actionData.method === 'MANUAL') ||
      (card && (card.targetMethod === 'MANUAL' || card.targetMode === 'MANUAL') && actionData.method !== '자동' && actionData.method !== '어그로');
    let effectiveTargetMethod = isActionManual ? 'MANUAL' : 'AUTO';
    let effectiveManualTarget = isActionManual ? (manualTarget?.characterId || manualTarget) : null;

    if (tgt === '자신' || tgt === 'SELF') {
      targetPool = attacker && !attacker.isDead && attacker.hp > 0 ? [attacker] : [];
      effectiveManualTarget = attacker ? attacker.characterId : null;
      effectiveTargetMethod = 'MANUAL';
    } else if (tgt === '자신_중심_아군') {
      targetPool = team.characters;
      effectiveManualTarget = attacker ? attacker.characterId : null;
      effectiveTargetMethod = 'MANUAL';
    } else if (tgt === '아군' || tgt === '무작위_아군' || tgt === '아군_전체' || tgt === '최저체력_아군' || tgt === 'ALLY') {
      targetPool = team.characters;
    } else {
      targetPool = opponentTeam.characters;
    }

    let targets = [];
    if (tgt === '자신' || tgt === 'SELF') {
      targets = targetPool;
    } else if (tgt === '아군_전체' || tgt === 'ALL_ALLIES') {
      targets = team.characters.filter(c => !c.isDead && c.hp > 0);
    } else if (tgt === '적_전체' || tgt === 'ALL_ENEMIES') {
      targets = opponentTeam.characters.filter(c => !c.isDead && c.hp > 0);
    } else if (tgt === '최저체력_아군') {
      const sorted = [...team.characters].filter(c => !c.isDead && c.hp > 0).sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp));
      targets = sorted.slice(0, actionData.count || 1);
    } else {
      let chosenTargetId = (effectiveTargetMethod === 'MANUAL') ? effectiveManualTarget : null;
      if (effectiveTargetMethod === 'MANUAL' && chosenTargetId) {
        const charId = (typeof chosenTargetId === 'object' && chosenTargetId !== null)
          ? (chosenTargetId.characterId || chosenTargetId.id)
          : chosenTargetId;
        chosenTargetId = charId;
        const char = this.getCharacterById(chosenTargetId);
        const isTargetingAlly = (tgt === '아군' || tgt === '자신_중심_아군');
        if (char) {
          const isCharAlly = (char.teamId === team.teamId);
          if (isTargetingAlly !== isCharAlly) {
            chosenTargetId = null;
          }
        }
      }

      targets = resolveTargets({
        candidatePool: targetPool,
        targetMethod: effectiveTargetMethod,
        manualTarget: chosenTargetId,
        targetCount: actionData.count || 1,
        range: actionData.range || 'SINGLE',
        rng: this.rng
      });
    }

    if (!targets || targets.length === 0) return;

    const mult = Number(actionData.multiplier) || 0;
    const baseStatName = actionData.calc;

    for (let tIdx = 0; tIdx < targets.length; tIdx++) {
      const target = targets[tIdx];
      if (target.isDead || target.hp <= 0) continue;

      if (actionData.type === 'DAMAGE_PHYS' || actionData.type === 'DAMAGE_MAGIC') {
        if (attacker) target.lastAttacker = attacker;
        const damageType = (actionData.type === 'DAMAGE_MAGIC') ? 'MAGIC' : 'PHYSICAL';
        const scalingStat = (damageType === 'MAGIC') ? 'IDOL_POWER' : 'ATK';

        const hasDealtBreak = executionContext ? executionContext.breakDealtSet.has(target.characterId) : false;
        const dmgResult = calculateAndApplyDamage({
          attacker: attacker || { atk: 100, idolPower: 100, accuracy: 100, critChance: 5, critDmg: 1.5 },
          target,
          damageType,
          scalingStat,
          multiplier: mult > 0 ? mult : 100,
          skillBreakBonus: Number(actionData.breakDmg) || 0,
          hasDealtBreakThisSkill: hasDealtBreak,
          isUltimate: (card.cardType === CardType.ULTIMATE),
          rng: this.rng,
          team
        });

        if (executionContext) {
          if (dmgResult.isBreakOccurred) executionContext.breakDealtSet.add(target.characterId);
          if (dmgResult.isBreakingOccurred) executionContext.brokenTargetsThisSkill.add(target.characterId);
          if (dmgResult.isKill) executionContext.killedTargetsThisSkill.add(target.characterId);
        }

        this.log(`피해 입힘 -> ${target.name}: HP 피해 ${dmgResult.hpDamage} (쉴드 ${dmgResult.shieldDamage}) [남은 HP: ${target.hp}/${target.maxHp}, Break: ${target.currentBreak}/${target.maxBreak}]`);

        this.emit('damage', {
          attacker,
          target,
          amount: dmgResult.hpDamage + (dmgResult.shieldDamage || 0),
          hpDamage: dmgResult.hpDamage,
          shieldDamage: dmgResult.shieldDamage,
          isCritical: dmgResult.isCritical,
          damageType,
          isHit: dmgResult.isHit,
          isBreak: dmgResult.isBreakOccurred,
          isBreaking: dmgResult.isBreakingOccurred
        });

        if (dmgResult.majestyTriggered) {
          const maj = dmgResult.majestyTriggered;
          if (maj.casterHeal > 0) {
            this.log(`👑 [위엄 적중] ${maj.caster.name} 최대 체력의 10% 회복 (+${maj.casterHeal} HP)`);
            this.emit('heal', { caster: maj.caster, target: maj.caster, amount: maj.casterHeal });
          }
          if (maj.lowestAlly && maj.allyHeal > 0) {
            this.log(`👑 [위엄 적중] 최저 체력 아군 ${maj.lowestAlly.name} 10% 회복 (+${maj.allyHeal} HP)`);
            this.emit('heal', { caster: maj.caster, target: maj.lowestAlly, amount: maj.allyHeal });
          }
        }

        if (!dmgResult.isHit) {
          this.log(`회피 발생 (Miss) -> ${target.name}`);
          if (dmgResult.dancingTurnReduced) {
            const remText = (dmgResult.dancingRemainingDuration <= 0) ? '소멸' : `${dmgResult.dancingRemainingDuration}턴`;
            this.log(`🎶 [댄싱] ${target.name} 회피 발동! 댄싱 지속 턴 1 감소 (잔여: ${remText})`);
          }
          continue;
        }
      } else if (actionData.type === 'SHIELD') {
        const baseStat = (baseStatName === '최대체력' || baseStatName === '타깃_최대체력')
          ? (target.maxHp || 1000)
          : (baseStatName === '공격력')
            ? (attacker?.atk || 100)
            : (attacker?.idolPower || 100);
        const shieldAmount = Math.round(baseStat * (mult / 100));
        applyShield(target, shieldAmount);
        this.log(`보호막 부여 -> ${target.name}: +${shieldAmount} 쉴드`);
        this.emit('shield_applied', { caster: attacker, target, amount: shieldAmount });
      } else if (actionData.type === 'HEAL') {
        const baseStat = (baseStatName === '최대체력' || baseStatName === '타깃_최대체력')
          ? (target.maxHp || 1000)
          : (baseStatName === '공격력')
            ? (attacker?.atk || 100)
            : (attacker?.idolPower || 100);
        const healAmount = Math.round(baseStat * (mult / 100));
        const healed = applyHealing({ target, amount: healAmount });
        this.log(`체력 회복 -> ${target.name}: +${healed} HP [현재 HP: ${target.hp}/${target.maxHp}]`);
        this.emit('heal', { caster: attacker, target, amount: healed });
      }

      if (actionData.k1Id) {
        this._applyActionKeyword(target, attacker, team, opponentTeam, actionData.k1Id, actionData.k1V1, actionData.k1V2);
      }
      if (actionData.k2Id) {
        this._applyActionKeyword(target, attacker, team, opponentTeam, actionData.k2Id, actionData.k2V1, actionData.k2V2);
      }
    }
  }

  /**
   * Executes conditional action (e.g. Harmony synergy, On kill/break, Full moon OH reduce)
   */
  _executeConditionalAction({ team, opponentTeam, attacker, card, skillData, executionContext }) {
    const condTrig = skillData.Cond_Trigger || (skillData.cond && skillData.cond.trigger);
    if (!condTrig || condTrig === 'NONE') return;

    const paramKw = skillData.Cond_Param_Keyword || (skillData.cond && skillData.cond.paramKw);
    const effType = skillData.Cond_Effect_Type || (skillData.cond && skillData.cond.effectType);
    const effTarget = skillData.Cond_Effect_Target || (skillData.cond && skillData.cond.effectTarget);
    const val1 = skillData.Cond_Effect_Val1 || (skillData.cond && skillData.cond.effectVal1);
    const val2 = skillData.Cond_Effect_Val2 || (skillData.cond && skillData.cond.effectVal2);

    if (condTrig === 'FILTER_ALLIES_WITH_KEYWORD') {
      const cleanFilterId = String(paramKw || 'Key_025').replace(/^[tsaeTSAE]_/, '').trim();
      const matchingAllies = team.characters.filter(c => !c.isDead && c.hp > 0 && Array.isArray(c.statusSlots) && c.statusSlots.some(s => s.keywordId === cleanFilterId || s.name === '하모니'));

      if (effType === 'APPLY_KEYWORD') {
        const cleanRewardId = String(val1 || cleanFilterId).replace(/^[tsaeTSAE]_/, '').trim();
        let stack = 1, dur = 3;
        if (typeof val2 === 'string' && val2.includes('/')) {
          const parts = val2.split('/');
          stack = Number(parts[0]) || 1;
          dur = Number(parts[1]) || 3;
        } else {
          stack = Number(val2) || 1;
        }

        for (const ally of matchingAllies) {
          this._applyActionKeyword(ally, attacker, team, opponentTeam, cleanRewardId, stack, dur);
        }
        if (matchingAllies.length > 0) {
          this.log(`🎼 [하모니 시너지] 하모니 보유 아군 ${matchingAllies.length}명에게 [하모니] (${stack}스택/${dur}턴) 부여!`);
        }
      }
    } else if (condTrig === 'ON_KILL_OR_BREAK') {
      const didKillOrBreak = executionContext && (executionContext.killedTargetsThisSkill.size > 0 || executionContext.brokenTargetsThisSkill.size > 0);
      if (didKillOrBreak) {
        const cleanRewardId = String(val1 || 'Key_007').replace(/^[tsaeTSAE]_/, '').trim();
        let stack = 2, dur = 1;
        if (typeof val2 === 'string' && val2.includes('/')) {
          const parts = val2.split('/');
          stack = Number(parts[0]) || 2;
          dur = Number(parts[1]) || 1;
        }
        const targetList = (effTarget === 'ALL_ENEMIES') ? opponentTeam.characters.filter(c => !c.isDead && c.hp > 0) : [];
        for (const t of targetList) {
          this._applyActionKeyword(t, attacker, team, opponentTeam, cleanRewardId, stack, dur);
        }
        this.log(`💥 [처치/브레이킹 연계 발동!] 모든 적에게 [${cleanRewardId}] ${stack}스택/${dur}턴 부여!`);
      }
    } else if (condTrig === 'IF_CASTER_HAS_KEYWORD') {
      const cleanCheckId = String(paramKw || '').replace(/^[tsaeTSAE]_/, '').trim();
      const hasKw = attacker && Array.isArray(attacker.statusSlots) && attacker.statusSlots.some(s => s.keywordId === cleanCheckId || s.name === '만월');
      if (hasKw) {
        if (effType === 'OVERHEAT_REDUCE') {
          const reduceAmt = Number(val1) || 20;
          card.bonusOverheat = (card.bonusOverheat || 0) - reduceAmt;
          this.log(`🌕 [만월 효과] ${card.skillName} 카드 오버히트 -${reduceAmt} 영구 감소! (현재 보너스: ${card.bonusOverheat})`);
        }
      }
    }
  }

  /**
   * Top-level Multi-Action Skill Resolver
   */
  _resolveMultiActionSkill({ team, opponentTeam, attacker, card, skillData, manualTarget }) {
    const condTrig = skillData.Cond_Trigger || (skillData.cond && skillData.cond.trigger);
    if (condTrig === 'BRANCH_BY_TARGET_TEAM') {
      const chosenChar = manualTarget ? this.getCharacterById(manualTarget) : null;
      const isAllyChosen = chosenChar ? (chosenChar.teamId === team.teamId) : false;
      if (isAllyChosen) {
        this._executeSingleAction({ team, opponentTeam, attacker, card, actionData: this._getActData(skillData, 1), manualTarget });
      } else {
        this._executeSingleAction({ team, opponentTeam, attacker, card, actionData: this._getActData(skillData, 2), manualTarget });
      }
      return;
    }

    const executionContext = {
      breakDealtSet: new Set(),
      brokenTargetsThisSkill: new Set(),
      killedTargetsThisSkill: new Set()
    };

    const act1Data = this._getActData(skillData, 1);
    if (act1Data && act1Data.type !== 'NONE') {
      this._executeSingleAction({ team, opponentTeam, attacker, card, actionData: act1Data, manualTarget, executionContext });
    }

    const act2Data = this._getActData(skillData, 2);
    if (act2Data && act2Data.type !== 'NONE') {
      this._executeSingleAction({ team, opponentTeam, attacker, card, actionData: act2Data, manualTarget, executionContext });
    }

    this._executeConditionalAction({ team, opponentTeam, attacker, card, skillData, executionContext });
  }

  /**
   * Resolves compound multi-target skills (e.g. B_S_234) and branching skills (e.g. B_S_217)
   * where ally buff/heal and enemy debuff/damage operate on separate targets.
   */
  _resolveCompoundSkill({ team, opponentTeam, attacker, card, skillData, manualTarget }) {
    const desc = String(skillData.Skill_Desc || '');
    const isBranching = desc.includes('대상에 따라');

    const findKeyword = (kwId, fallbackName = '', isDebuff = false) => {
      const cleanId = String(kwId || '').replace(/^[tsaeTSAE]_/, '').trim();
      return this.keywordsMasterMap[cleanId] || this.keywordsMasterMap[kwId] || {
        Keyword_ID: cleanId,
        Keyword_Name: fallbackName || cleanId,
        Keyword_Type: isDebuff ? '디버프' : '버프'
      };
    };

    const applySingleStatus = (t, kw, val1, val2) => {
      if (!t || t.isDead || t.hp <= 0) return;
      const statusRes = applyStatus(t, kw, Number(val1) || 1, Number(val2) || 1, { caster: attacker, attacker, team, opponentTeam, rng: this.rng });
      if (statusRes && statusRes.isPurify) {
        this.log(`💠 [정화 발동] ${t.name}의 상단 디버프 ${statusRes.clearedCount}개 완전 제거!`);
        this.emit('status_cleansed', { caster: attacker, target: t, clearedCount: statusRes.clearedCount, keyword: kw });
      } else if (statusRes) {
        this.log(`상태 부여 [${kw.Keyword_Name || kw.Keyword_ID}] ${statusRes.stack} (${statusRes.duration}턴) -> ${t.name}`);
        this.emit('status_applied', { caster: attacker, target: t, keyword: kw, stack: statusRes.stack, duration: statusRes.duration });
      }
    };

    const sheetEffects = [];
    for (let i = 1; i <= 3; i++) {
      const rawId = skillData[`Skill_Effect_${i}_ID`];
      if (rawId) {
        sheetEffects.push({
          idx: i,
          rawId,
          cleanId: String(rawId).replace(/^[tsaeTSAE]_/, '').trim(),
          val1: Number(skillData[`Skill_Effect_${i}_Val1`] || 1),
          val2: Number(skillData[`Skill_Effect_${i}_Val2`] || 1)
        });
      }
    }

    const isEffectMatchingSentence = (eff, kw, sentence) => {
      const hasRealName = Boolean(kw.Keyword_Name && kw.Keyword_Name !== eff.cleanId);
      const kwPattern = hasRealName ? new RegExp(`\\[[^\\]]*${kw.Keyword_Name}[^\\]]*?(\\d+)\\s*/\\s*(\\d+)[^\\]]*\\]`) : null;
      const m = kwPattern ? sentence.match(kwPattern) : null;
      if (m) {
        return (Number(m[1]) === eff.val1 && Number(m[2]) === eff.val2);
      }
      if (sentence.includes(`${eff.val1} / ${eff.val2}`) || sentence.includes(`${eff.val1}/${eff.val2}`)) {
        return hasRealName ? sentence.includes(kw.Keyword_Name) : true;
      }
      return hasRealName && sentence.includes(kw.Keyword_Name);
    };

    if (isBranching) {
      const chosenChar = manualTarget ? this.getCharacterById(manualTarget) : null;
      const isAllyChosen = chosenChar ? (chosenChar.teamId === team.teamId) : false;
      const clauses = desc.split(/혹은|대하여/);
      const allyClause = clauses.find(c => c.includes('아군')) || '';
      const enemyClause = clauses.find(c => c.includes('적')) || '';

      if (isAllyChosen) {
        const isSplash = allyClause.includes('3명') || allyClause.includes('타깃을 중심으로');
        const isAll = allyClause.includes('아군 전체');
        let allyTargets = [];
        if (isAll) {
          allyTargets = team.characters.filter(c => !c.isDead && c.hp > 0);
        } else {
          allyTargets = resolveTargets({
            candidatePool: team.characters,
            targetMethod: 'MANUAL',
            manualTarget: chosenChar.characterId,
            range: isSplash ? 'SPLASH_3' : 'SINGLE',
            rng: this.rng
          });
        }

        const shieldMatch = allyClause.match(/(\d+)%\s*만큼의?\s*(?:🔘\s*)?보호막/);
        const healMatch = allyClause.match(/(\d+)%\s*만큼\s*(?:체력\s*)?회복/);
        const baseStat = attacker?.idolPower || attacker?.atk || 100;

        for (const t of allyTargets) {
          if (t.isDead || t.hp <= 0) continue;
          if (shieldMatch) {
            const shieldAmt = Math.round(baseStat * (Number(shieldMatch[1]) / 100));
            applyShield(t, shieldAmt);
            this.log(`보호막 부여 -> ${t.name}: +${shieldAmt} 쉴드`);
            this.emit('shield_applied', { caster: attacker, target: t, amount: shieldAmt });
          }
          if (healMatch) {
            const healAmt = Math.round(baseStat * (Number(healMatch[1]) / 100));
            const healed = applyHealing({ target: t, amount: healAmt });
            this.log(`체력 회복 -> ${t.name}: +${healed} HP`);
            this.emit('heal', { caster: attacker, target: t, amount: healed });
          }
          for (const eff of sheetEffects) {
            const kw = findKeyword(eff.cleanId, '', false);
            if (isEffectMatchingSentence(eff, kw, allyClause)) {
              applySingleStatus(t, kw, eff.val1, eff.val2);
            }
          }
        }
        return;
      } else {
        const isSplash = enemyClause.includes('3명') || enemyClause.includes('타깃을 중심으로');
        const isAll = enemyClause.includes('적군 전체') || enemyClause.includes('적 전체');
        let enemyTargets = [];
        if (isAll) {
          enemyTargets = opponentTeam.characters.filter(c => !c.isDead && c.hp > 0);
        } else {
          enemyTargets = resolveTargets({
            candidatePool: opponentTeam.characters,
            targetMethod: chosenChar ? 'MANUAL' : 'AUTO',
            manualTarget: chosenChar ? chosenChar.characterId : null,
            range: isSplash ? 'SPLASH_3' : 'SINGLE',
            rng: this.rng
          });
        }

        const dmgMatch = enemyClause.match(/(\d+)%\s*만큼\s*(물리피해|마법피해)/);
        const mult = dmgMatch ? Number(dmgMatch[1]) : Number(skillData.Skill_Multiplier || 100);
        const isMagic = dmgMatch ? (dmgMatch[2] === '마법피해') : (skillData.Skill_Calc_Base === '아이돌력');
        const damageType = isMagic ? 'MAGIC' : 'PHYSICAL';
        const scalingStat = isMagic ? 'IDOL_POWER' : 'ATK';

        for (const t of enemyTargets) {
          if (t.isDead || t.hp <= 0) continue;
          if (attacker) t.lastAttacker = attacker;

          const dmgResult = calculateAndApplyDamage({
            attacker: attacker || { atk: 100, idolPower: 100, accuracy: 100, critChance: 5, critDmg: 1.5 },
            target: t,
            damageType,
            scalingStat,
            multiplier: mult,
            rng: this.rng
          });
          this.log(`피해 입힘 -> ${t.name}: HP 피해 ${dmgResult.hpDamage} [남은 HP: ${t.hp}/${t.maxHp}]`);
          this.emit('damage', {
            attacker,
            target: t,
            amount: dmgResult.hpDamage + (dmgResult.shieldDamage || 0),
            hpDamage: dmgResult.hpDamage,
            shieldDamage: dmgResult.shieldDamage,
            isCritical: dmgResult.isCritical,
            damageType,
            isHit: dmgResult.isHit,
            isBreak: dmgResult.isBreakOccurred,
            isBreaking: dmgResult.isBreakingOccurred
          });

          for (const eff of sheetEffects) {
            const kw = findKeyword(eff.cleanId, '', true);
            if (isEffectMatchingSentence(eff, kw, enemyClause)) {
              applySingleStatus(t, kw, eff.val1, eff.val2);
            }
          }
        }
        return;
      }
    }

    const sentences = desc.split(/[.?!]+|\s+혹은\s+|\s*(?:하고|하며)\s+(?=적|아군|자신)/).map(s => s.trim()).filter(Boolean);

    const breakDealtSet = new Set();
    const brokenTargetsThisSkill = new Set();
    const killedTargetsThisSkill = new Set();

    for (const sentence of sentences) {
      if (sentence.startsWith('자신에게') || sentence.includes('자신에게')) {
        if (attacker && !attacker.isDead && attacker.hp > 0) {
          const shieldMatch = sentence.match(/(\d+)%\s*만큼의?\s*(?:🔘\s*)?보호막/);
          if (shieldMatch) {
            const baseStat = attacker.idolPower || attacker.atk || 100;
            const shieldAmt = Math.round(baseStat * (Number(shieldMatch[1]) / 100));
            applyShield(attacker, shieldAmt);
            this.log(`보호막 부여 -> ${attacker.name}: +${shieldAmt} 쉴드`);
            this.emit('shield_applied', { caster: attacker, target: attacker, amount: shieldAmt });
          }
          for (const eff of sheetEffects) {
            const kw = findKeyword(eff.cleanId, '', false);
            if (isEffectMatchingSentence(eff, kw, sentence)) {
              applySingleStatus(attacker, kw, eff.val1, eff.val2);
            }
          }
        }
        continue;
      }

      if (sentence.includes('하모니를 보유중인 모든 아군')) {
        const harmonyAllies = team.characters.filter(c => !c.isDead && c.hp > 0 && c.statusSlots?.some(s => s.keywordId === 'Key_025' || s.name === '하모니'));
        for (const ha of harmonyAllies) {
          const kw = findKeyword('Key_025', '하모니', false);
          applySingleStatus(ha, kw, 1, 2);
        }
        continue;
      }

      if (sentence.includes('아군') || sentence.includes('자신을 중심으로') || sentence.includes('자신 중심')) {
        let allyTargets = [];
        const isCenterOnSelf = sentence.includes('자신을 중심으로') || sentence.includes('자신 중심');
        const isSplash7 = /중심으로\s*(?:아군\s*|적\s*)?(?:7명|7칸)/.test(sentence) || sentence.includes('중심으로 7명') || sentence.includes('중심 7명') || sentence.includes('7칸') || card.range === 'SPLASH_7';
        const isSplash5 = /중심으로\s*(?:아군\s*|적\s*)?(?:5명|5칸)/.test(sentence) || sentence.includes('중심으로 5명') || sentence.includes('중심 5명') || sentence.includes('5칸') || card.range === 'SPLASH_5';
        const isSplash3 = /중심으로\s*(?:아군\s*|적\s*)?(?:3명|3칸)/.test(sentence) || sentence.includes('아군 타깃을 중심으로') || sentence.includes('타깃을 중심으로') || sentence.includes('중심으로 3명') || sentence.includes('중심 3명') || sentence.includes('3칸') || (isCenterOnSelf && !isSplash7 && !isSplash5) || card.range === 'SPLASH_3' || card.range === 'SPLASH_1';
        let allyRange = (card.range && card.range.startsWith('SPLASH')) ? card.range : 'SINGLE';
        if (isSplash7) allyRange = 'SPLASH_7';
        else if (isSplash5) allyRange = 'SPLASH_5';
        else if (isSplash3) allyRange = 'SPLASH_3';

        const isLowestAlly = sentence.includes('가장 체력') || sentence.includes('체력 비율이 낮은');
        const lowestCountMatch = sentence.match(/낮은\s*아군\s*(\d+)명/);
        const lowestCount = lowestCountMatch ? parseInt(lowestCountMatch[1], 10) : 1;

        const randomAllyMatch = sentence.match(/무작위\s*아군\s*(\d+)명/);
        const randomAllyCount = randomAllyMatch ? parseInt(randomAllyMatch[1], 10) : 1;

        if (isCenterOnSelf) {
          allyTargets = resolveTargets({
            candidatePool: team.characters,
            targetMethod: 'MANUAL',
            manualTarget: attacker ? attacker.characterId : null,
            range: allyRange,
            rng: this.rng
          });
        } else if (isLowestAlly) {
          const sorted = [...team.characters]
            .filter(c => !c.isDead && c.hp > 0)
            .sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp));
          allyTargets = sorted.slice(0, lowestCount);
        } else if (sentence.includes('무작위 아군')) {
          allyTargets = resolveTargets({
            candidatePool: team.characters,
            targetMethod: 'AUTO',
            targetCount: randomAllyCount,
            rng: this.rng
          });
        } else if (sentence.includes('지정한 아군') || sentence.includes('아군 타깃') || (card.targetMethod === 'MANUAL' && !sentence.includes('무작위'))) {
          let chosenAllyId = (typeof manualTarget === 'object' && manualTarget !== null)
            ? (manualTarget.characterId || manualTarget.id)
            : manualTarget;
          const chosenChar = chosenAllyId ? this.getCharacterById(chosenAllyId) : null;
          if (!chosenChar || chosenChar.teamId !== team.teamId || chosenChar.isDead) {
            const fallback = [...team.characters].filter(c => !c.isDead && c.hp > 0).sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0];
            chosenAllyId = fallback ? fallback.characterId : null;
          }
          allyTargets = resolveTargets({
            candidatePool: team.characters,
            targetMethod: 'MANUAL',
            manualTarget: chosenAllyId,
            range: allyRange,
            rng: this.rng
          });
        } else {
          allyTargets = resolveTargets({
            candidatePool: team.characters,
            targetMethod: 'AUTO',
            targetCount: 1,
            range: allyRange,
            rng: this.rng
          });
        }

        const healMatch = sentence.match(/(\d+)%\s*만큼\s*(?:체력\s*)?회복/);
        const shieldMatch = sentence.match(/(\d+)%\s*만큼의?\s*(?:🔘\s*)?보호막/);
        const baseStat = attacker?.idolPower || attacker?.atk || 100;

        for (const t of allyTargets) {
          if (t.isDead || t.hp <= 0) continue;
          if (healMatch) {
            const healAmt = Math.round(baseStat * (Number(healMatch[1]) / 100));
            const healed = applyHealing({ target: t, amount: healAmt });
            this.log(`체력 회복 -> ${t.name}: +${healed} HP [현재 HP: ${t.hp}/${t.maxHp}]`);
            this.emit('heal', { caster: attacker, target: t, amount: healed });
          }
          if (shieldMatch) {
            const shieldAmt = Math.round(baseStat * (Number(shieldMatch[1]) / 100));
            applyShield(t, shieldAmt);
            this.log(`보호막 부여 -> ${t.name}: +${shieldAmt} 쉴드`);
            this.emit('shield_applied', { caster: attacker, target: t, amount: shieldAmt });
          }
          for (const eff of sheetEffects) {
            const kw = findKeyword(eff.cleanId, '', false);
            if (isEffectMatchingSentence(eff, kw, sentence)) {
              applySingleStatus(t, kw, eff.val1, eff.val2);
            }
          }
        }
        continue;
      }

      if (sentence.includes('적')) {
        let enemyTargets = [];
        const isSplash7 = /중심으로\s*(?:아군\s*|적\s*)?7명/.test(sentence) || sentence.includes('중심으로 7명') || sentence.includes('중심 7명');
        const isSplash5 = /중심으로\s*(?:아군\s*|적\s*)?5명/.test(sentence) || sentence.includes('중심으로 5명') || sentence.includes('중심 5명');
        const isSplash3 = /중심으로\s*(?:아군\s*|적\s*)?3명/.test(sentence) || sentence.includes('적 타깃을 중심으로') || sentence.includes('중심으로 3명') || sentence.includes('중심 3명');
        let enemyRange = 'SINGLE';
        if (isSplash7) enemyRange = 'SPLASH_7';
        else if (isSplash5) enemyRange = 'SPLASH_5';
        else if (isSplash3) enemyRange = 'SPLASH_3';
        const randomEnemyMatch = sentence.match(/무작위\s*적\s*(\d+)명/);
        const randomEnemyCount = randomEnemyMatch ? parseInt(randomEnemyMatch[1], 10) : 1;

        if (sentence.includes('무작위 적')) {
          enemyTargets = resolveTargets({
            candidatePool: opponentTeam.characters,
            targetMethod: 'AUTO',
            targetCount: randomEnemyCount,
            rng: this.rng
          });
        } else if (sentence.includes('지정한 적') || sentence.includes('적 타깃') || (card.targetMethod === 'MANUAL' && !sentence.includes('무작위'))) {
          let chosenEnemyId = (typeof manualTarget === 'object' && manualTarget !== null)
            ? (manualTarget.characterId || manualTarget.id)
            : manualTarget;
          const chosenChar = chosenEnemyId ? this.getCharacterById(chosenEnemyId) : null;
          if (!chosenChar || chosenChar.teamId === team.teamId || chosenChar.isDead) {
            chosenEnemyId = selectByAggroRoulette(opponentTeam.characters.filter(c => !c.isDead && c.hp > 0), this.rng)?.characterId;
          }
          enemyTargets = resolveTargets({
            candidatePool: opponentTeam.characters,
            targetMethod: 'MANUAL',
            manualTarget: chosenEnemyId,
            range: enemyRange,
            rng: this.rng
          });
        } else {
          enemyTargets = resolveTargets({
            candidatePool: opponentTeam.characters,
            targetMethod: 'AUTO',
            targetCount: 1,
            range: enemyRange,
            rng: this.rng
          });
        }

        const dmgMatch = sentence.match(/(\d+)%\s*만큼\s*(물리\s*피해|마법\s*피해)/);
        const mult = dmgMatch ? Number(dmgMatch[1]) : (Number(skillData.Skill_Multiplier) > 0 ? Number(skillData.Skill_Multiplier) : 0);
        const isMagic = dmgMatch ? (dmgMatch[2].replace(/\s+/g, '') === '마법피해') : (skillData.Skill_Calc_Base === '아이돌력' || skillData.Skill_Calc_Base === 'MAGIC');
        const damageType = isMagic ? 'MAGIC' : 'PHYSICAL';
        const scalingStat = isMagic ? 'IDOL_POWER' : 'ATK';

        for (const t of enemyTargets) {
          if (t.isDead || t.hp <= 0) continue;
          if (mult > 0) {
            if (attacker) t.lastAttacker = attacker;
            const hasDealtBreak = breakDealtSet.has(t.characterId);
            const dmgResult = calculateAndApplyDamage({
              attacker: attacker || { atk: 100, idolPower: 100, accuracy: 100, critChance: 5, critDmg: 1.5 },
              target: t,
              damageType,
              scalingStat,
              multiplier: mult,
              skillBreakBonus: Number(skillData.Skill_Break || 0),
              hasDealtBreakThisSkill: hasDealtBreak,
              isUltimate: (card.cardType === CardType.ULTIMATE),
              rng: this.rng
            });

            if (dmgResult.isBreakOccurred) breakDealtSet.add(t.characterId);
            if (dmgResult.isBreakingOccurred) brokenTargetsThisSkill.add(t.characterId);
            if (dmgResult.isKill) killedTargetsThisSkill.add(t.characterId);

            this.log(`피해 입힘 -> ${t.name}: HP 피해 ${dmgResult.hpDamage} [남은 HP: ${t.hp}/${t.maxHp}]`);
            this.emit('damage', {
              attacker,
              target: t,
              amount: dmgResult.hpDamage + (dmgResult.shieldDamage || 0),
              hpDamage: dmgResult.hpDamage,
              shieldDamage: dmgResult.shieldDamage,
              isCritical: dmgResult.isCritical,
              damageType,
              isHit: dmgResult.isHit,
              isBreak: dmgResult.isBreakOccurred,
              isBreaking: dmgResult.isBreakingOccurred
            });
          }

          for (const eff of sheetEffects) {
            const kw = findKeyword(eff.cleanId, '', true);
            if (isEffectMatchingSentence(eff, kw, sentence)) {
              applySingleStatus(t, kw, eff.val1, eff.val2);
            }
          }
        }
        continue;
      }
    }
  }

  /**
   * Executes Skill Effect Sequence strictly in order (Section 22~25, 107~111).
   */
  _resolveSkillEffects({ team, opponentTeam, attacker, card, skillData, manualTarget }) {
    // 신규 멀티 액션 규격 (Act1 / Act2 / Cond) 우선 처리 (단, Act1/Act2가 모두 NONE이 아닌 유효한 액션이 있을 때만 진입)
    const hasValidAct1 = (skillData.act1 && skillData.act1.type && skillData.act1.type !== 'NONE') ||
                         (skillData.Act1_Type && skillData.Act1_Type !== 'NONE');
    const hasValidAct2 = (skillData.act2 && skillData.act2.type && skillData.act2.type !== 'NONE') ||
                         (skillData.Act2_Type && skillData.Act2_Type !== 'NONE');
    if (skillData.hasMultiAction || hasValidAct1 || hasValidAct2) {
      return this._resolveMultiActionSkill({ team, opponentTeam, attacker, card, skillData, manualTarget });
    }

    const isOffensive = card.isOffensive;
    const targetType = String(skillData.Skill_Target || skillData.target || '').trim();
    let targetRange = card.range || skillData.Skill_Target_Range || 'SINGLE';
    const desc = String(skillData.Skill_Desc || '');
    if ((desc.startsWith('적 1명에게') || desc.startsWith('지정한 적 1명에게')) && targetRange === 'ALL') {
      targetRange = 'SINGLE';
    }
    if (targetRange === 'SINGLE' && desc.includes('중심으로')) {
      if (desc.includes('7명')) targetRange = 'SPLASH_7';
      else if (desc.includes('5명')) targetRange = 'SPLASH_5';
      else if (desc.includes('3명')) targetRange = 'SPLASH_3';
    }
    const isSplash = (targetRange === 'SPLASH_1' || targetRange === 'SPLASH_2' || targetRange === 'SPLASH_3' || targetRange === 'SPLASH_5' || targetRange === 'SPLASH_7' || targetRange === 'SPLASH');

    // Check for Compound / Branching dual target skills (Section 22~25)
    const isCompoundOrBranching = ((desc.includes('아군') || desc.includes('자신을 중심으로')) && desc.includes('적')) ||
      desc.includes('대상에 따라') ||
      (desc.includes('지정한 적') && desc.includes('무작위 적')) ||
      (desc.includes('지정한 아군') && desc.includes('무작위 아군'));
    if (isCompoundOrBranching && !Array.isArray(skillData.sequence)) {
      return this._resolveCompoundSkill({ team, opponentTeam, attacker, card, skillData, manualTarget });
    }

    const isCenterOnSelf = desc.includes('자신을 중심으로') || ((targetType === '자신' || targetType === 'SELF') && isSplash);

    let targetPool;
    let effectiveTargetMethod = card.targetMethod;
    let effectiveManualTarget = manualTarget;

    const isAllyTarget = targetType.includes('아군') || targetType.includes('자신') || targetType === 'ALLY' || targetType === 'SELF' || !isOffensive;

    if (isCenterOnSelf && isSplash && !manualTarget) {
      // 자신 중심 스플래시: 수동 지정 타깃이 없을 때만 시전자(attacker)를 중심으로 반경 내 대상 선정
      targetPool = team.characters;
      effectiveManualTarget = attacker ? attacker.characterId : null;
      effectiveTargetMethod = 'MANUAL';
    } else if (targetType === '자신' || targetType === 'SELF') {
      targetPool = attacker ? [attacker] : team.characters;
      effectiveManualTarget = attacker ? attacker.characterId : manualTarget;
      effectiveTargetMethod = 'MANUAL';
    } else if (isAllyTarget) {
      targetPool = team.characters;
    } else {
      targetPool = opponentTeam.characters;
    }

    if (effectiveTargetMethod !== 'MANUAL') {
      effectiveManualTarget = null;
    }

    const targets = resolveTargets({
      candidatePool: targetPool,
      targetMethod: effectiveTargetMethod,
      manualTarget: effectiveManualTarget,
      targetCount: card.targetCount,
      range: targetRange,
      rng: this.rng
    });

    if (targets.length === 0) {
      this.log('유효한 스킬 대상이 없습니다.');
      return;
    }

    // Context tracking for this skill execution (Section 24, 110)
    const breakDealtSet = new Set();
    const brokenTargetsThisSkill = new Set();
    const killedTargetsThisSkill = new Set();

    // 1. If explicit sequence array is defined (e.g. custom/advanced skills like Meteor Slash / 유성참)
    if (Array.isArray(skillData.sequence) && skillData.sequence.length > 0) {
      let conditionMet = true;
      for (const step of skillData.sequence) {
        if (step.conditional && !conditionMet) continue;

        if (step.type === 'STATUS' || step.type === 'DEBUFF' || step.type === 'BUFF') {
          const stepTargets = step.targetRange === 'ALL_ENEMIES' ? opponentTeam.characters.filter(c => !c.isDead && c.hp > 0)
            : step.targetRange === 'ALL_ALLIES' ? team.characters.filter(c => !c.isDead && c.hp > 0)
            : (step.targetRange === 'SELF' || step.targetRange === 'CASTER') ? (attacker && !attacker.isDead && attacker.hp > 0 ? [attacker] : [])
            : targets;
          for (const t of stepTargets) {
            if (t.isDead || t.hp <= 0) continue;
            const cleanKwId = String(step.keywordId).replace(/^[tsaeTSAE]_/, '');
            const kw = this.keywordsMasterMap[cleanKwId] || this.keywordsMasterMap[step.keywordId] || { Keyword_ID: cleanKwId, Keyword_Name: step.name || cleanKwId, Keyword_Type: step.type === 'DEBUFF' ? '디버프' : '버프' };
            const statusRes = applyStatus(t, kw, step.stack || 1, step.duration || 1, { caster: attacker, attacker, team, opponentTeam, rng: this.rng });
            if (statusRes && statusRes.isPurify) {
              this.log(`💠 [시퀀스 정화 발동] ${t.name}의 상단 디버프 ${statusRes.clearedCount}개 완전 제거! (정화 소멸)`);
              this.emit('status_cleansed', { caster: attacker, target: t, clearedCount: statusRes.clearedCount, keyword: kw });
            } else if (statusRes) {
              this.log(`시퀀스 상태 부여 [${kw.Keyword_Name || cleanKwId}] ${statusRes.stack} (${statusRes.duration}턴) -> ${t.name}`);
              this.emit('status_applied', { caster: attacker, target: t, keyword: kw, stack: statusRes.stack, duration: statusRes.duration });
            }
          }
        } else if (step.type === 'DAMAGE') {
          const stepMultiplier = Number(step.multiplier ?? skillData.Skill_Multiplier ?? 100);
          const stepBreakBonus = Number(step.skillBreakBonus ?? skillData.Skill_Break ?? 0);
          const calcBase = step.calcBase || skillData.Skill_Calc_Base;
          const damageType = (calcBase === '아이돌력' || calcBase === 'MAGIC') ? 'MAGIC' : 'PHYSICAL';
          const scalingStat = (calcBase === '최대체력' || calcBase === 'TARGET_MAX_HP') ? 'TARGET_MAX_HP' : (damageType === 'MAGIC' ? 'IDOL_POWER' : 'ATK');

          for (const target of targets) {
            if (target.isDead || target.hp <= 0) continue;
            if (attacker) target.lastAttacker = attacker;
            const hasDealtBreak = breakDealtSet.has(target.characterId);
            const dmgResult = calculateAndApplyDamage({
              attacker: attacker || { atk: 100, idolPower: 100, accuracy: 100, critChance: 5, critDmg: 1.5 },
              target,
              damageType,
              scalingStat,
              multiplier: stepMultiplier,
              skillBreakBonus: stepBreakBonus,
              hasDealtBreakThisSkill: hasDealtBreak,
              isUltimate: (card.cardType === CardType.ULTIMATE),
              rng: this.rng
            });
            if (dmgResult.isBreakOccurred) breakDealtSet.add(target.characterId);
            if (dmgResult.isBreakingOccurred) brokenTargetsThisSkill.add(target.characterId);
            if (dmgResult.isKill) killedTargetsThisSkill.add(target.characterId);
            this.log(`시퀀스 피해 입힘 -> ${target.name}: HP 피해 ${dmgResult.hpDamage} [남은 HP: ${target.hp}/${target.maxHp}]`);
            this.emit('damage', {
              attacker,
              target,
              amount: dmgResult.hpDamage + (dmgResult.shieldDamage || 0),
              hpDamage: dmgResult.hpDamage,
              shieldDamage: dmgResult.shieldDamage,
              isCritical: dmgResult.isCritical,
              damageType,
              isHit: dmgResult.isHit,
              isBreak: dmgResult.isBreakOccurred,
              isBreaking: dmgResult.isBreakingOccurred
            });
          }
        } else if (step.type === 'HEAL') {
          for (const target of targets) {
            if (target.isDead || target.hp <= 0) continue;
            const healed = applyHealing({ target, amount: step.amount, percent: step.percent });
            this.log(`시퀀스 회복 -> ${target.name}: +${healed} HP [현재 HP: ${target.hp}/${target.maxHp}]`);
          }
        } else if (step.type === 'CONDITION') {
          const cond = step.condType;
          conditionMet = targets.some(t => {
            if (cond === 'KILL') return killedTargetsThisSkill.has(t.characterId);
            if (cond === 'BREAK') return brokenTargetsThisSkill.has(t.characterId);
            if (cond === 'KILL_OR_BREAK') return killedTargetsThisSkill.has(t.characterId) || brokenTargetsThisSkill.has(t.characterId);
            if (cond === 'KEYWORD') return t.statusSlots.some(s => s.keywordId === step.keywordId && s.stack >= (step.minStack || 1));
            return false;
          });
          this.log(`조건 검사 [${cond}]: ${conditionMet ? '만족 (참)' : '불만족 (거짓)'}`);
        }
      }
      return;
    }

    // 2. Standard spreadsheet-driven flow
    let skillMultiplier = Number(skillData.Skill_Multiplier || 0);
    if (skillMultiplier === 0 && desc) {
      const multMatch = desc.match(/(\d+)%\s*만큼\s*(물리\s*피해|마법\s*피해)/);
      if (multMatch) {
        skillMultiplier = Number(multMatch[1]) || 0;
      }
    }
    const skillBreakBonus = Number(skillData.Skill_Break || 0);
    const calcBase = skillData.Skill_Calc_Base;
    const damageType = (calcBase === '아이돌력' || calcBase === 'MAGIC' || (skillMultiplier > 0 && desc.includes('마법'))) ? 'MAGIC' : 'PHYSICAL';
    const scalingStat = (calcBase === '최대체력' || calcBase === 'TARGET_MAX_HP') ? 'TARGET_MAX_HP' : (damageType === 'MAGIC' ? 'IDOL_POWER' : 'ATK');

    const isDebuffFirst = Boolean(skillData.applyDebuffFirst || skillData.Skill_Effect_Order === 'DEBUFF_FIRST');

    // Multi-target resolution helper (Target prefixes: T_, S_, A_, E_ with intelligent inference fallback)
    const resolveEffectTargetInfo = (effectIdx) => {
      const rawId = skillData[`Skill_Effect_${effectIdx}_ID`];
      if (!rawId) return null;

      const effectVal1 = Number(skillData[`Skill_Effect_${effectIdx}_Val1`] || 1);
      const effectVal2 = Number(skillData[`Skill_Effect_${effectIdx}_Val2`] || 1);

      let cleanId = String(rawId).trim();
      let targetType = null; // 'SELF', 'TARGET', 'ALL_ALLIES', 'ALL_ENEMIES'

      // 1. Explicit Prefix check: T_, S_, A_, E_
      if (/^[sS]_/.test(cleanId)) {
        targetType = 'SELF';
        cleanId = cleanId.replace(/^[sS]_/, '');
      } else if (/^[tT]_/.test(cleanId)) {
        targetType = 'TARGET';
        cleanId = cleanId.replace(/^[tT]_/, '');
      } else if (/^[aA]_/.test(cleanId)) {
        targetType = 'ALL_ALLIES';
        cleanId = cleanId.replace(/^[aA]_/, '');
      } else if (/^[eE]_/.test(cleanId)) {
        targetType = 'ALL_ENEMIES';
        cleanId = cleanId.replace(/^[eE]_/, '');
      }

      // Conditional reward exclusion:
      // If the skill specifies a condition (Skill_Cond_Type) and this effect matches the conditional reward,
      // do not apply it as an unconditional base effect!
      const condType = skillData.Skill_Cond_Type;
      const cleanRewardVal1 = String(skillData.Skill_Reward_Val1 || '').replace(/^[tsaeTSAE]_/, '').trim();
      if (condType && cleanRewardVal1 && (cleanId === cleanRewardVal1 || rawId === skillData.Skill_Reward_Val1)) {
        return null;
      }

      // 2. Intelligent fallback or Splash refinement
      const desc = String(skillData.Skill_Desc || '');
      const isSplashSkill = (targetRange === 'SPLASH_1' || targetRange === 'SPLASH_2' || targetRange === 'SPLASH_3' || targetRange === 'SPLASH_5' || targetRange === 'SPLASH' || (typeof targetRange === 'string' && targetRange.startsWith('SPLASH_')));

      const kw = this.keywordsMasterMap[cleanId] || this.keywordsMasterMap[rawId] || {
        Keyword_ID: cleanId,
        Keyword_Name: cleanId,
        Keyword_Type: (targetType === 'SELF' || targetType === 'ALL_ALLIES' || !isOffensive) ? '버프' : '디버프'
      };
      const kwName = kw.Keyword_Name || '';
      const clauses = desc.split(/[.?!]+|\s+혹은\s+|\s*(?:하고|하며)\s+(?=적|아군|자신)/).map(s => s.trim()).filter(Boolean);

      let matchedClause = '';
      for (const clause of clauses) {
        const hasKw = kwName && clause.includes(kwName);
        const hasVals = effectVal1 && effectVal2 && clause.includes(`${effectVal1} / ${effectVal2}`);
        if (hasKw || hasVals) {
          matchedClause = clause;
          break;
        }
      }

      if (matchedClause) {
        if ((matchedClause.includes('상태라면') || matchedClause.includes('보유시') || matchedClause.includes('이라면')) && !matchedClause.includes('부여') && !matchedClause.includes('획득')) {
          return null;
        }
        // If this clause describes a conditional trigger (e.g. 사망하거나, 브레이킹 상태가 된다면, 처치시, 사망시),
        // do not apply it as an unconditional base effect!
        const isConditionalClause = /사망|처치|브레이킹.*(?:된다면|경우|시\b)|된다면|만족시|충족시|처치하면|처치할/.test(matchedClause);
        if (isConditionalClause && (matchedClause.includes('한다면') || matchedClause.includes('된다면') || matchedClause.includes('경우') || matchedClause.includes('처치') || matchedClause.includes('사망') || matchedClause.includes('브레이킹'))) {
          return null;
        }
        if (matchedClause.includes('자신에게') || matchedClause.includes('자신이') || matchedClause.includes('자신의')) {
          targetType = 'SELF';
        } else if (matchedClause.includes('모든 아군') || matchedClause.includes('아군 전체')) {
          targetType = 'ALL_ALLIES';
        } else if (matchedClause.includes('모든 적') || matchedClause.includes('적 전체')) {
          targetType = 'ALL_ENEMIES';
        } else if (isSplashSkill) {
          const isSplashClause = matchedClause.includes('중심으로') || matchedClause.includes('3명') || matchedClause.includes('5명') || matchedClause.includes('7명');
          const PRIMARY_TARGET_REGEX = /(?:지정한\s*(?:적|아군)?\s*(?:타깃|대상|1명)|적\s*1명|아군\s*1명|^적에게\s*\[|^아군에게\s*\[|적\s*타깃에게|아군\s*타깃에게)/;
          if (!isSplashClause && PRIMARY_TARGET_REGEX.test(matchedClause)) {
            // Rule for skills like B_S_122, B_S_168, B_S_250, B_S_467: primary target keyword on splash skills
            targetType = 'PRIMARY_TARGET';
          } else if (!targetType) {
            targetType = 'TARGET';
          }
        } else if (!targetType) {
          targetType = 'TARGET';
        }
      }

      if (!targetType) {
        const mentionsSelf = desc.includes('자신');
        const mentionsOthers = desc.includes('적') || desc.includes('아군') || desc.includes('타깃') || desc.includes('대상');
        if (mentionsSelf && !mentionsOthers) {
          targetType = 'SELF';
        } else if (String(skillData.Skill_Target || '적') === '자신' && !mentionsOthers) {
          targetType = 'SELF';
        } else {
          targetType = 'TARGET';
        }
      }

      return {
        rawId,
        cleanId,
        kw,
        val1: effectVal1,
        val2: effectVal2,
        targetType
      };
    };

    const resolvedEffects = [];
    for (let i = 1; i <= 3; i++) {
      const eff = resolveEffectTargetInfo(i);
      if (eff) resolvedEffects.push(eff);
    }

    const applySingleStatus = (t, eff) => {
      if (!t || t.isDead || t.hp <= 0) return;
      const statusRes = applyStatus(t, eff.kw, eff.val1, eff.val2, { caster: attacker, attacker, team, opponentTeam, rng: this.rng });
      if (statusRes && statusRes.isPurify) {
        this.log(`💠 [정화 발동] ${t.name}의 상단 디버프 ${statusRes.clearedCount}개 완전 제거! (정화 소멸)`);
        this.emit('status_cleansed', { caster: attacker, target: t, clearedCount: statusRes.clearedCount, keyword: eff.kw });
      } else if (statusRes) {
        this.log(`상태 부여 [${eff.kw.Keyword_Name || eff.cleanId}] ${statusRes.stack} (${statusRes.duration}턴) -> ${t.name}`);
        this.emit('status_applied', { caster: attacker, target: t, keyword: eff.kw, stack: statusRes.stack, duration: statusRes.duration });
      }
    };

    const applyTargetKeywords = (target, isPrimary = false) => {
      for (const eff of resolvedEffects) {
        if (eff.targetType === 'TARGET') {
          applySingleStatus(target, eff);
        } else if (eff.targetType === 'PRIMARY_TARGET' && isPrimary) {
          applySingleStatus(target, eff);
        }
      }
    };

    const applyNonTargetKeywords = () => {
      for (const eff of resolvedEffects) {
        if (eff.targetType === 'SELF') {
          if (attacker && !attacker.isDead && attacker.hp > 0) {
            applySingleStatus(attacker, eff);
          }
        } else if (eff.targetType === 'ALL_ALLIES') {
          for (const ally of team.characters) {
            applySingleStatus(ally, eff);
          }
        } else if (eff.targetType === 'ALL_ENEMIES') {
          for (const enemy of opponentTeam.characters) {
            applySingleStatus(enemy, eff);
          }
        }
      }
    };

    if (isDebuffFirst) {
      applyNonTargetKeywords();
    }

    const isSplashSkill = (targetRange === 'SPLASH_1' || targetRange === 'SPLASH_2' || targetRange === 'SPLASH_3' || targetRange === 'SPLASH_5' || targetRange === 'SPLASH' || (typeof targetRange === 'string' && targetRange.startsWith('SPLASH_')));
    const dmgClauses = desc.split(/[.?!]+|\s+혹은\s+|\s*(?:하고|하며)\s+(?=적|아군|자신)/).filter(c => c.includes('피해') || c.includes('공격력의') || c.includes('아이돌력의'));
    const isDmgSingleOnly = isSplashSkill && dmgClauses.length > 0 && dmgClauses.every(c => (c.includes('1명에게') || c.includes('1명을') || c.includes('지정한 적') || c.includes('적 타깃에게')) && !c.includes('중심으로') && !c.includes('3명') && !c.includes('5명') && !c.includes('7명'));

    for (let tIdx = 0; tIdx < targets.length; tIdx++) {
      const target = targets[tIdx];
      const isPrimary = (tIdx === 0);
      if (target.isDead || target.hp <= 0) continue;

      if (isDebuffFirst) {
        applyTargetKeywords(target, isPrimary);
      }

      if (isDmgSingleOnly && !isPrimary) {
        // Damage restricted to primary target only
      } else if (isOffensive && (skillMultiplier > 0 || scalingStat === 'TARGET_MAX_HP')) {
        if (attacker) {
          target.lastAttacker = attacker;
        }
        const hasDealtBreak = breakDealtSet.has(target.characterId);
        const dmgResult = calculateAndApplyDamage({
          attacker: attacker || { atk: 100, idolPower: 100, accuracy: 100, critChance: 5, critDmg: 1.5 },
          target,
          damageType,
          scalingStat,
          multiplier: skillMultiplier || 100,
          skillBreakBonus,
          hasDealtBreakThisSkill: hasDealtBreak,
          isUltimate: (card.cardType === CardType.ULTIMATE),
          rng: this.rng,
          team
        });

        if (dmgResult.isBreakOccurred) breakDealtSet.add(target.characterId);
        if (dmgResult.isBreakingOccurred) brokenTargetsThisSkill.add(target.characterId);
        if (dmgResult.isKill) killedTargetsThisSkill.add(target.characterId);

        this.log(`피해 입힘 -> ${target.name}: HP 피해 ${dmgResult.hpDamage} (쉴드 ${dmgResult.shieldDamage}) [남은 HP: ${target.hp}/${target.maxHp}, Break: ${target.currentBreak}/${target.maxBreak}]`);

        this.emit('damage', {
          attacker,
          target,
          amount: dmgResult.hpDamage + (dmgResult.shieldDamage || 0),
          hpDamage: dmgResult.hpDamage,
          shieldDamage: dmgResult.shieldDamage,
          isCritical: dmgResult.isCritical,
          damageType,
          isHit: dmgResult.isHit,
          isBreak: dmgResult.isBreakOccurred,
          isBreaking: dmgResult.isBreakingOccurred
        });

        if (dmgResult.majestyTriggered) {
          const maj = dmgResult.majestyTriggered;
          if (maj.casterHeal > 0) {
            this.log(`👑 [위엄 적중] ${maj.caster.name} 최대 체력의 10% 회복 (+${maj.casterHeal} HP)`);
            this.emit('heal', { caster: maj.caster, target: maj.caster, amount: maj.casterHeal });
          }
          if (maj.lowestAlly && maj.allyHeal > 0) {
            this.log(`👑 [위엄 적중] 최저 체력 아군 ${maj.lowestAlly.name} 10% 회복 (+${maj.allyHeal} HP)`);
            this.emit('heal', { caster: maj.caster, target: maj.lowestAlly, amount: maj.allyHeal });
          }
        }

        if (!dmgResult.isHit) {
          this.log(`회피 발생 (Miss) -> ${target.name}`);
          if (dmgResult.dancingTurnReduced) {
            const remText = (dmgResult.dancingRemainingDuration <= 0) ? '소멸' : `${dmgResult.dancingRemainingDuration}턴`;
            this.log(`🎶 [댄싱] ${target.name} 회피 발동! 댄싱 지속 턴 1 감소 (잔여: ${remText})`);
          }
          continue; // Chained debuffs do not apply on miss (Section 26)
        }
      } else if (!isOffensive && skillMultiplier > 0) {
        const desc = String(skillData.Skill_Desc || '');
        const isShield = desc.includes('보호막') || desc.includes('방어막');
        const calcBase = skillData.Skill_Calc_Base;
        const baseStat = (calcBase === '최대체력' || calcBase === 'TARGET_MAX_HP')
          ? (target.maxHp || 1000)
          : (attacker?.idolPower || attacker?.atk || 100);

        if (isShield) {
          const shieldClauses = desc.split(/[.?!]+|\s+혹은\s+|\s*(?:하고|하며)\s+(?=적|아군|자신)/).filter(c => c.includes('보호막') || c.includes('방어막'));
          const isShieldSingleOnly = isSplashSkill && shieldClauses.length > 0 && shieldClauses.every(c => !c.includes('중심으로') && !c.includes('3명') && !c.includes('5명') && !c.includes('7명') && (c.includes('1명에게') || c.includes('1명을') || c.includes('지정한 아군') || c.includes('아군 타깃에게')));
          if (isShieldSingleOnly && !isPrimary) {
            // Shield restricted to primary target only
          } else {
            const shieldAmount = Math.round(baseStat * (skillMultiplier / 100));
            applyShield(target, shieldAmount);
            this.log(`보호막 부여 -> ${target.name}: +${shieldAmount} 쉴드`);
            this.emit('shield_applied', { caster: attacker, target, amount: shieldAmount });
          }
        } else {
          const healClauses = desc.split(/[.?!]+|\s+혹은\s+|\s*(?:하고|하며)\s+(?=적|아군|자신)/).filter(c => c.includes('회복'));
          const isHealSingleOnly = isSplashSkill && healClauses.length > 0 && healClauses.every(c => !c.includes('중심으로') && !c.includes('3명') && !c.includes('5명') && !c.includes('7명') && (c.includes('1명에게') || c.includes('1명을') || c.includes('지정한 아군') || c.includes('아군 타깃에게')));
          if (isHealSingleOnly && !isPrimary) {
            // Heal restricted to primary target only
          } else {
            // Healing skill: scales with idolPower (or calcBase), NOT target Max HP!
            const healAmount = Math.round(baseStat * (skillMultiplier / 100));
            const healed = applyHealing({ target, amount: healAmount });
            this.log(`체력 회복 -> ${target.name}: +${healed} HP [현재 HP: ${target.hp}/${target.maxHp}]`);
            this.emit('heal', { caster: attacker, target, amount: healed });
          }
        }
      }

      if (!isDebuffFirst) {
        applyTargetKeywords(target, isPrimary);
      }
    }

    if (!isDebuffFirst) {
      applyNonTargetKeywords();
    }

    // Conditional Effect Check (Section 23, 24, 108)
    const condType = skillData.Skill_Cond_Type;
    if (condType) {
      let isCondSatisfied = false;
      const condVal = skillData.Skill_Cond_Value;

      if (condType === '사망' || condType === 'KILL') {
        isCondSatisfied = targets.some(t => killedTargetsThisSkill.has(t.characterId) || t.hp <= 0 || t.isDead);
      } else if (condType === '브레이킹' || condType === 'BREAK') {
        isCondSatisfied = targets.some(t => brokenTargetsThisSkill.has(t.characterId));
      } else if (condType === '사망_또는_브레이킹' || condType === 'KILL_OR_BREAK') {
        isCondSatisfied = targets.some(t => killedTargetsThisSkill.has(t.characterId) || brokenTargetsThisSkill.has(t.characterId) || t.hp <= 0 || t.isDead);
      } else if (condType === '키워드' || condType === 'KEYWORD' || condType === '키워드_보유') {
        isCondSatisfied = targets.some(t => t.statusSlots && t.statusSlots.some(s => s.keywordId === condVal || s.name === condVal));
      }

      if (isCondSatisfied) {
        this.log(`조건 [${condType}] 충족! 추가 효과 발동`);
        const rewardType = skillData.Skill_Reward_Type;
        const rewardVal1 = skillData.Skill_Reward_Val1;
        const rewardVal2 = skillData.Skill_Reward_Val2;

        if (rewardType === 'AOE_DEBUFF' || rewardType === 'DEBUFF' || rewardType === '키워드' || rewardType === '키워드_부여') {
          const rewardTargets = opponentTeam.characters.filter(c => !c.isDead && c.hp > 0);
          let rStack = 1;
          let rDuration = 1;
          if (typeof rewardVal2 === 'string' && rewardVal2.includes('/')) {
            const parts = rewardVal2.split('/');
            rStack = Number(parts[0]) || 1;
            rDuration = Number(parts[1]) || 1;
          } else {
            rStack = Number(rewardVal2) || 1;
          }
          for (const rt of rewardTargets) {
            const cleanRVal1 = String(rewardVal1).replace(/^[tsaeTSAE]_/, '');
            const kw = this.keywordsMasterMap[cleanRVal1] || this.keywordsMasterMap[rewardVal1] || { Keyword_ID: cleanRVal1, Keyword_Name: cleanRVal1, Keyword_Type: '디버프' };
            applyStatus(rt, kw, rStack, rDuration, { caster: attacker, attacker, team, opponentTeam, rng: this.rng });
            this.log(`조건 보상 상태 부여 [${kw.Keyword_Name || cleanRVal1}] ${rStack} (${rDuration}턴) -> ${rt.name}`);
          }
        }
      }
    }
  }

  /**
   * Rule 58, 59: Death Resolution (executed after skill sequence terminates).
   */
  _resolveDeaths() {
    let newlyDeadFound = true;
    while (newlyDeadFound) {
      newlyDeadFound = false;

      const checkTeam = (team) => {
        for (const char of team.characters) {
          if (!char.isDead && char.hp <= 0) {
            // Key_028: Resurrection (부활) - 사망 시 최대 체력의 10% * 스택으로 부활 (한 전투에 1회만 발동 가능)
            const reviveSlotIndex = (char.statusSlots || []).findIndex(s => {
              const sClean = String(s.keywordId || '').replace(/^[tsaeTSAE]_/, '').trim();
              return sClean === 'Key_028' || s.keywordId === 'Key_028' || s.name === '부활' || (s.keyword && (s.keyword.Keyword_ID === 'Key_028' || s.keyword.Keyword_Name === '부활'));
            });
            if (reviveSlotIndex !== -1 && !char.hasRevived) {
              const reviveSlot = char.statusSlots[reviveSlotIndex];
              const reviveHpPct = Math.min(100, Math.max(10, 10 * (reviveSlot.stack || 1)));
              char.statusSlots.splice(reviveSlotIndex, 1);
              char.hasRevived = true;
              char.isDead = false;
              char.isBreaking = false;
              char.currentBreak = char.maxBreak;
              char.hp = Math.round((char.maxHp * reviveHpPct) / 100);
              this.log(`💖 [부활 발동!] ${char.name}이(가) 최대 체력의 ${reviveHpPct}%(HP ${char.hp})로 부활했습니다!`);
              this.emit('characterRevived', { character: char, hp: char.hp });
              continue;
            }

            char.isDead = true;
            char.hp = 0;
            char.aggro = 0; // Rule 58: Aggro 0
            this.log(`💀 [사망] ${char.name} 사망 처리`);
            newlyDeadFound = true;

            // Key_041: 폭탄 (💣) 사망 시 폭발 (기본 20% + 10% = 총 30% 마법피해 + 원소 4스택 / 1턴)
            const bombIndex = (char.statusSlots || []).findIndex(s => s.keywordId === 'Key_041' || s.name === '폭탄');
            if (bombIndex !== -1) {
              char.statusSlots.splice(bombIndex, 1);
              const centerPos = char.formationPosition;
              const adjacentAllies = team.characters.filter(c => !c.isDead && c.hp > 0 && Math.abs(c.formationPosition - centerPos) === 1);
              this.log(`💣 [폭탄 자폭!] 사망한 ${char.name}의 폭탄이 폭발하여 인접 아군 ${adjacentAllies.length}명에게 30% 마법 피해와 [원소 4 / 1] 부여!`);
              for (const ally of adjacentAllies) {
                const bombDmg = Math.round((ally.maxHp || 1000) * 0.3);
                ally.hp = Math.max(0, ally.hp - bombDmg);
                applyStatus(ally, {
                  Keyword_ID: 'Key_004',
                  Keyword_Name: '원소',
                  Keyword_Type: '디버프',
                  Keyword_Stack_Type: '스택',
                  Keyword_MAX: 10
                }, 4, 1, { rng: this.rng });
                this.emit('damage', {
                  attacker: char,
                  target: ally,
                  amount: bombDmg,
                  hpDamage: bombDmg,
                  shieldDamage: 0,
                  isCritical: false,
                  damageType: 'MAGIC',
                  isHit: true
                });
              }
            }

            // Kill Event Triggers: Key_034 일등성, Key_049 영혼수확
            const killer = char.lastAttacker;
            if (killer && !killer.isDead && killer.hp > 0) {
              // Key_034: 일등성 (🌟) - 33% 회복 + 공격력 33% 영구 증가 누적
              if (Array.isArray(killer.statusSlots) && killer.statusSlots.some(s => s.keywordId === 'Key_034' || s.name === '일등성')) {
                killer.starKillCount = (killer.starKillCount || 0) + 1;
                applyHealing({ target: killer, percent: 33 });
                this.log(`🌟 [일등성 발동!] ${killer.name} 적 처치로 33% 체력 회복 및 누적 공격력 +33% 영구 증가 (총 처치: ${killer.starKillCount}회)`);
              }

              // Key_049: 영혼수확 (💀) - 처치 시 스택 획득 (스택당 치명+14%, 치피+44%)
              if (Array.isArray(killer.statusSlots) && killer.statusSlots.some(s => s.keywordId === 'Key_049' || s.name === '영혼수확')) {
                const curHarvestSlot = killer.statusSlots.find(s => s.keywordId === 'Key_049' || s.name === '영혼수확');
                const nextHarvestStack = curHarvestSlot ? Math.min(44, (curHarvestSlot.stack || 0) + 1) : 1;
                applyStatus(killer, {
                  Keyword_ID: 'Key_049',
                  Keyword_Name: '영혼수확',
                  Keyword_Type: '버프',
                  Keyword_Stack_Type: '파워',
                  isImmortal: true,
                  Keyword_MAX: 44,
                  Keyword_Stat_Target_1: '치명타%',
                  Keyword_Stat_Value_1: 14,
                  Keyword_Stat_Target_2: '치명타피해량%',
                  Keyword_Stat_Value_2: 44
                }, nextHarvestStack, 999, { rng: this.rng });
                this.log(`💀 [영혼수확 발동!] ${killer.name} 적 처치로 영혼 수확 스택 획득! (현재 스택: ${nextHarvestStack})`);
              }
            }

            // Rule 59, 61: Remove character cards & add 1 Memorial card (B_S_001) to dead character's team deck
            handleCharacterDeathCards(team, char.characterId);
            this.log(`🕯️ [추모 카드 삽입] 사망한 ${char.name}의 진영(${team.teamId}) 덱에 B_S_001(추모) 카드 1장 삽입 (현재 덱: ${team.deck.length}장)`);
            this.emit('characterDead', char);
          }
        }
      };

      checkTeam(this.state.teamA);
      checkTeam(this.state.teamB);
    }
  }

  /**
   * Rule 66: Counter Phase (Formation position ascending order).
   */
  _resolveCounterPhase() {
    this.state.battlePhase = BattlePhase.COUNTER_PHASE;
    const allLiving = [...this.state.teamA.characters, ...this.state.teamB.characters]
      .filter(c => !c.isDead && c.hp > 0)
      .sort((a, b) => a.formationPosition - b.formationPosition);

    for (const defender of allLiving) {
      this.emit('counterCheck', defender);
      if (defender.isDead || defender.hp <= 0) continue;

      // Check for counter keyword Key_023 (반격)
      const counterSlotIndex = (defender.statusSlots || []).findIndex(s =>
        s.keywordId === 'Key_023' ||
        s.keywordId === 'S_Key_023' ||
        s.keywordId === 'T_Key_023' ||
        s.name === '반격' ||
        (typeof s.keywordId === 'string' && s.keywordId.includes('Key_023'))
      );
      if (counterSlotIndex !== -1 && defender.lastAttacker && defender.lastAttacker.teamId !== defender.teamId && !defender.lastAttacker.isDead && defender.lastAttacker.hp > 0) {
        const attacker = defender.lastAttacker;
        const defenderTeam = (this.state.teamA.characters.includes(defender)) ? this.state.teamA : this.state.teamB;

        // Resolve basic attack characteristics for counter
        const basicSkillId = (defender.basicSkillIds && defender.basicSkillIds.length > 0) ? defender.basicSkillIds[0] : 'B_S_002';
        const basicSkill = this.skillsMasterMap[basicSkillId] || null;

        let isMagic = false;
        if (basicSkill) {
          const calc = basicSkill.Act1_Calc_Base || basicSkill.Skill_Calc_Base || '';
          if (calc === '아이돌력' || calc === 'MAGIC' || basicSkill.Act1_Type === 'DAMAGE_MAGIC') {
            isMagic = true;
          }
        }
        if (!isMagic) {
          isMagic = (defender.mainRole === CharacterRole.MAGIC_DPS ||
                     defender.mainRole === CharacterRole.HEALER ||
                     defender.mainRole === CharacterRole.BUFFER ||
                     (defender.idolPower > defender.atk &&
                      defender.mainRole !== CharacterRole.TANK &&
                      defender.mainRole !== CharacterRole.MELEE_DPS &&
                      defender.mainRole !== CharacterRole.RANGED_DPS &&
                      defender.mainRole !== CharacterRole.ASSASSIN));
        }

        const damageType = isMagic ? DamageType.MAGIC : DamageType.PHYSICAL;
        const scalingStat = isMagic ? 'IDOL_POWER' : 'ATK';

        let mult = 100;
        if (basicSkill) {
          const m = Number(basicSkill.Act1_Multiplier || basicSkill.Skill_Multiplier || 0);
          if (m > 0) {
            mult = m;
          } else if (basicSkill.Skill_Desc) {
            const descMatch = basicSkill.Skill_Desc.match(/(\d+)%\s*만큼/);
            if (descMatch) mult = Number(descMatch[1]) || 100;
          }
        }

        const breakBonus = Number(basicSkill?.Act1_Break || basicSkill?.Skill_Break || 0);

        this.log(`♻️ [반격 발동] ${defender.name}이(가) ${attacker.name}에게 기본공격(${isMagic ? '마법' : '물리'} ${mult}%)으로 반격합니다!`);
        this.emit('counterTriggered', {
          counterUnit: defender,
          defender,
          attacker,
          target: attacker,
          counterSkill: basicSkill || { Skill_Name: '반격', Skill_ID: 'Key_023' }
        });

        const dmgResult = calculateAndApplyDamage({
          attacker: defender,
          target: attacker,
          damageType,
          scalingStat,
          multiplier: mult,
          skillBreakBonus: breakBonus,
          rng: this.rng,
          team: defenderTeam
        });

        if (!dmgResult.isHit) {
          this.log(`회피 발생 (Miss) -> ${attacker.name}`);
        } else {
          this.log(`피해 입힘 -> ${attacker.name}: HP 피해 ${dmgResult.hpDamage} (쉴드 ${dmgResult.shieldDamage || 0}) [남은 HP: ${attacker.hp}/${attacker.maxHp}, Break: ${attacker.currentBreak}/${attacker.maxBreak}]`);
        }

        this.emit('damage', {
          attacker: defender,
          target: attacker,
          amount: dmgResult.hpDamage + (dmgResult.shieldDamage || 0),
          hpDamage: dmgResult.hpDamage,
          shieldDamage: dmgResult.shieldDamage,
          isCritical: dmgResult.isCritical,
          damageType,
          isHit: dmgResult.isHit,
          isBreak: dmgResult.isBreakOccurred,
          isBreaking: dmgResult.isBreakingOccurred,
          isCounter: true
        });

        // Decrement counter keyword duration (반격 발동 시 턴수 1 잃음)
        const slot = defender.statusSlots[counterSlotIndex];
        slot.duration -= 1;
        if (slot.duration <= 0) {
          defender.statusSlots.splice(counterSlotIndex, 1);
        }

        this._resolveDeaths();
      }

      defender.lastAttacker = null;
    }
  }

  /**
   * Rule 78, 79, 80: Checks Battle Outcome (Win/Loss and Deadlock).
   */
  _checkBattleOutcome() {
    const livingA = this.state.teamA.characters.filter(c => !c.isDead && c.hp > 0).length;
    const livingB = this.state.teamB.characters.filter(c => !c.isDead && c.hp > 0).length;

    if (livingB === 0 && livingA > 0) {
      this.state.battleResult = 'PLAYER_WIN';
      this.state.battlePhase = BattlePhase.BATTLE_END;
      this.log('🏆 [전투 승리] 적 팀 전원 행동 불능!');
      this.emit('battleEnd', { result: 'PLAYER_WIN' });
      return true;
    }

    if (livingA === 0) {
      this.state.battleResult = 'PLAYER_LOSE';
      this.state.battlePhase = BattlePhase.BATTLE_END;
      this.log('💀 [전투 패배] 아군 팀 전원 행동 불능!');
      this.emit('battleEnd', { result: 'PLAYER_LOSE' });
      return true;
    }

    // Rule 79, 80: Deadlock Check
    // Both sides have 0 offensive cards in Deck + Discard + Hand (only evaluated after turn 1)
    const hasOffensiveCards = (team) => {
      const allPool = [...team.deck, ...team.discard, ...team.hand];
      return allPool.some(c => {
        if (c.isOffensive) return true;
        const desc = c.rawSkill?.Skill_Desc || '';
        if (desc.includes('피해')) return true;
        const a1 = c.rawSkill?.Act1_Type || c.rawSkill?.act1?.type;
        const a2 = c.rawSkill?.Act2_Type || c.rawSkill?.act2?.type;
        if (a1 && a1.includes('DAMAGE')) return true;
        if (a2 && a2.includes('DAMAGE')) return true;
        return false;
      });
    };

    if (this.state.turnCount > 1 && !hasOffensiveCards(this.state.teamA) && !hasOffensiveCards(this.state.teamB)) {
      this.log('⚠️ [교착 상태 발생] 양 진영 공격 가능한 카드 전무!');
      const hpRatioA = this._calculateTeamHpRatio(this.state.teamA);
      const hpRatioB = this._calculateTeamHpRatio(this.state.teamB);

      if (hpRatioA >= hpRatioB) {
        this.state.battleResult = 'PLAYER_WIN';
        this.log(`교착 판정: 아군 HP 비율(${hpRatioA.toFixed(2)}) >= 적군 HP 비율(${hpRatioB.toFixed(2)}) -> 플레이어 승리!`);
      } else {
        this.state.battleResult = 'PLAYER_LOSE';
        this.log(`교착 판정: 아군 HP 비율(${hpRatioA.toFixed(2)}) < 적군 HP 비율(${hpRatioB.toFixed(2)}) -> 플레이어 패배!`);
      }

      this.state.battlePhase = BattlePhase.BATTLE_END;
      this.emit('battleEnd', { result: this.state.battleResult });
      return true;
    }

    return false;
  }

  _calculateTeamHpRatio(team) {
    let totalHp = 0;
    let totalMax = 0;
    for (const c of team.characters) {
      totalHp += Math.max(0, c.hp);
      totalMax += Math.max(1, c.maxHp);
    }
    return totalMax > 0 ? (totalHp / totalMax) : 0;
  }

  /**
   * Rule 62, 64, 81: Turn End.
   */
  endTurn(team) {
    this.state.battlePhase = BattlePhase.TURN_END;

    // Set Next Turn Requirement = 200 + currentTurnOverheat (Rule 62)
    const nextReq = 200 + team.currentTurnOverheat;
    team.turnRequirement = nextReq;
    team.nextTurnRequirement = nextReq;
    this.log(`${team.teamId} 턴 종료. 다음 턴 요구치: ${team.turnRequirement} (오버히트: ${team.currentTurnOverheat})`);
    team.currentTurnOverheat = 0;

    // Clean up temporary 1-turn Slot Machine buffs on all cards
    const cleanSlotMachineBuff = (c) => {
      if (c && c._slotMachineBuff) {
        c.isQuick = c._originalIsQuick || false;
        c.bonusOverheat = (c.bonusOverheat || 0) + 20;
        delete c._slotMachineBuff;
        delete c._originalIsQuick;
      }
    };
    (team.hand || []).forEach(cleanSlotMachineBuff);
    (team.discard || []).forEach(cleanSlotMachineBuff);
    (team.deck || []).forEach(cleanSlotMachineBuff);

    // Decrement Breaking turns remaining
    for (const char of team.characters) {
      if (char.isBreaking) {
        char.breakingTurnsRemaining -= 1;
        if (char.breakingTurnsRemaining <= 0) {
          char.isBreaking = false;
          char.currentBreak = char.maxBreak; // Rule 45: Recover to Max Break
          this.log(`${char.name}의 브레이킹 상태 해제 (Break 복구: ${char.maxBreak})`);
        }
      }
    }

    this.state.battlePhase = BattlePhase.TICK_RUNNING;
    this.emit('turnEnd', { team });
  }
}
