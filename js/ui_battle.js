/**
 * Player-Facing 8 vs 8 Battle Arena UI (Combat Arena)
 * Connects BattleEngine to interactive visuals matching the user design specification.
 */

import { BattleEngine } from './battle/battle_engine.js';
import { createTeamState, createCharacterBattleState, CardType, BattlePhase } from './battle/battle_types.js';
import { extractCharacterCombatModifiers } from './battle/damage_resolver.js';
import { getEffectiveAggro } from './battle/target_resolver.js';
import { getCardOverheat, createTiredCard, shuffleCards } from './battle/card_deck.js';
import { GameData, PlayerData } from './state.js?v=004276';
import { applyIssuesToBattle } from './battle/issue_resolver.js?v=004276';
import { addAccountExp } from './ui.js?v=004276';
import {
  generate8vs8Teams,
  buildMasterMaps,
  ATTR_BADGES,
  CORE_KEYWORDS,
  initSampleBattle as initDebugSampleBattle
} from './ui_battle_debug.js';

// Global Arena State
let activeArenaEngine = null;
let arenaTickTimer = null;
let currentSpeed = 1; // 1x, 2x, 4x, 8x
let isPaused = false;
let isBattleStarted = false;
let isAutoBattleActive = false;
let selectedHandCard = null;
let isManualTargeting = false;
let damageStats = { TEAM_A: {}, TEAM_B: {} };
let pendingCardSelection = null;
let wasPausedBeforeCharModal = false;

// Attribute Icons Map
export const ATTR_ICONS = {
  '청초': 'https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Seiso_icon.png',
  '쿨': 'https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Cool_icon.png',
  '게닌': 'https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Genin_icon.png',
  '아티스트': 'https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Artist_icon.png',
  '큐트': 'https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Cute_icon.png',
  '광기': 'https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Crazy_icon.png',
  '에로': 'https://raw.githubusercontent.com/nahan5694/holtochess3/refs/heads/main/icon/Ero_icon.png'
};

// Role Korean Names Mapping
export const ROLE_KOREAN_NAMES = {
  'TANK': '탱커',
  'MELEE_DPS': '근거리 딜러',
  'RANGED_DPS': '원거리 딜러',
  'MAGIC_DPS': '마법 딜러',
  'ASSASSIN': '암살자',
  'BUFFER': '버퍼',
  'DEBUFFER': '디버퍼',
  'HEALER': '힐러',
  '탱커': '탱커',
  '근거리 딜러': '근거리 딜러',
  '원거리 딜러': '원거리 딜러',
  '마법 딜러': '마법 딜러',
  '암살자': '암살자',
  '버퍼': '버퍼',
  '디버퍼': '디버퍼',
  '힐러': '힐러',
  '딜러': '근거리 딜러'
};

export function getKoreanRoleName(role) {
  if (!role) return '탱커';
  return ROLE_KOREAN_NAMES[role] || role;
}

// Role Border & Theme Colors
export const ROLE_COLORS = {
  '탱커': '#3b82f6',
  '근거리 딜러': '#f97316',
  '원거리 딜러': '#eab308',
  '마법 딜러': '#a855f7',
  '암살자': '#ec4899',
  '버퍼': '#06b6d4',
  '디버퍼': '#8b5cf6',
  '힐러': '#10b981',
  'TANK': '#3b82f6',
  'MELEE_DPS': '#f97316',
  'RANGED_DPS': '#eab308',
  'MAGIC_DPS': '#a855f7',
  'ASSASSIN': '#ec4899',
  'BUFFER': '#06b6d4',
  'DEBUFFER': '#8b5cf6',
  'HEALER': '#10b981'
};

// Keyword Treat-As & 10+ Stack Synergy Emphasis (Key_002 파괴, Key_003 매료, Key_004 원소)
export const KEYWORD_TREAT_AS_MAP = {
  'Key_001': 'Key_002', // 출혈 -> 파괴
  'Key_009': 'Key_004', // 빙결 -> 원소
  'Key_010': 'Key_004', // 젖음 -> 원소
  'Key_011': 'Key_004'  // 흑마법 -> 원소
};

export function getKeywordSynergyGroup(keywordId, keywordName, rawKeyword = null) {
  const kId = keywordId || '';
  const kName = keywordName || '';
  if (kId === 'Key_002' || kName === '파괴') return 'Key_002';
  if (kId === 'Key_003' || kName === '매료') return 'Key_003';
  if (kId === 'Key_004' || kName === '원소' || kName === '화상' || kName === '화염') return 'Key_004';

  let treatAs = KEYWORD_TREAT_AS_MAP[kId] || rawKeyword?.Keyword_Treat_As;
  if (!treatAs && typeof window !== 'undefined' && window.GameData?.keyword) {
    const kw = window.GameData.keyword.find(k => k.Keyword_ID === kId || k.Keyword_Name === kName);
    if (kw?.Keyword_Treat_As) treatAs = kw.Keyword_Treat_As;
  }
  if (treatAs === 'Key_002' || treatAs === '파괴') return 'Key_002';
  if (treatAs === 'Key_003' || treatAs === '매료') return 'Key_003';
  if (treatAs === 'Key_004' || treatAs === '원소') return 'Key_004';
  return null;
}

export function getCharacterSynergyStackTotal(character, groupKey) {
  if (!character || !Array.isArray(character.statusSlots)) return 0;
  let total = 0;
  for (const s of character.statusSlots) {
    const grp = getKeywordSynergyGroup(s.keywordId, s.name, s.rawKeyword);
    if (grp === groupKey) {
      total += (Number(s.stack) || 1);
    }
  }
  return total;
}

/**
 * Initialize Battle Arena UI
 */
export function initBattleArenaUI() {
  const arenaContainer = document.getElementById('battle-arena-view');
  if (!arenaContainer) return;

  initKeywordFloatingTooltip();

  // Rule: Prevent all native OS/Windows white tooltips inside battle scene by continuously stripping any title attribute
  const sceneBattleEl = document.getElementById('scene-battle');
  if (sceneBattleEl) {
    sceneBattleEl.querySelectorAll('[title]').forEach(el => el.removeAttribute('title'));
    if (typeof MutationObserver !== 'undefined') {
      const titleObserver = new MutationObserver((mutations) => {
        for (const m of mutations) {
          if (m.type === 'attributes' && m.attributeName === 'title' && m.target?.hasAttribute?.('title')) {
            m.target.removeAttribute('title');
          } else if (m.type === 'childList') {
            for (const node of m.addedNodes) {
              if (node.nodeType === 1) {
                if (node.hasAttribute('title')) node.removeAttribute('title');
                node.querySelectorAll?.('[title]').forEach(el => el.removeAttribute('title'));
              }
            }
          }
        }
      });
      titleObserver.observe(sceneBattleEl, { attributes: true, subtree: true, attributeFilter: ['title'], childList: true });
    }
  }

  // Header button bindings
  const btnStart = document.getElementById('btn-arena-start');
  const btnStep = document.getElementById('btn-arena-step');
  const btnSpeed = document.getElementById('btn-arena-speed');
  const btnStats = document.getElementById('btn-arena-stats');
  const btnTypeChart = document.getElementById('btn-arena-type-chart');
  const btnSurrender = document.getElementById('btn-arena-surrender');
  const btnCloseStats = document.getElementById('btn-close-battle-stats');
  const btnCloseCardModal = document.getElementById('btn-close-card-modal');
  const btnCancelTargeting = document.getElementById('btn-cancel-targeting');
  const btnRestartResult = document.getElementById('btn-battle-result-restart');
  const btnExitResult = document.getElementById('btn-battle-result-exit');

  if (btnTypeChart) {
    btnTypeChart.addEventListener('click', () => {
      openTypeAdvantageModal();
    });
  }

  const btnArenaMuteBgm = document.getElementById('btn-arena-mute-bgm');
  if (btnArenaMuteBgm) {
    btnArenaMuteBgm.addEventListener('click', () => {
      if (!PlayerData.options) PlayerData.options = {};
      PlayerData.options.muteBgm = !PlayerData.options.muteBgm;
      btnArenaMuteBgm.textContent = PlayerData.options.muteBgm ? '🔇' : '🔊';
      if (typeof window.savePlayerData === 'function') {
        window.savePlayerData();
      }
      if (typeof window.applyVolumeSettings === 'function') {
        window.applyVolumeSettings();
      }
    });
  }

  if (btnStart) {
    btnStart.addEventListener('click', () => {
      if (!isBattleStarted) {
        beginBattle();
      } else {
        startFreshBattle(false);
      }
    });
  }

  const btnAutoResolve = document.getElementById('btn-arena-auto-resolve');
  if (btnAutoResolve) {
    btnAutoResolve.addEventListener('click', () => {
      if (!activeArenaEngine || !isBattleStarted) return;
      closeCardModal();
      activeArenaEngine.manualPlayerPass = false;
      activeArenaEngine.state.teamA.isPlayer = false;
      currentSpeed = 4;
      updateSpeedButtonText();
      isPaused = false;
      isManualTargeting = false;
      if (targetingOverlay) targetingOverlay.style.display = 'none';
      if (activeArenaEngine.triggerAutoTurnIfNeeded) {
        activeArenaEngine.triggerAutoTurnIfNeeded();
      }
      if (arenaTickTimer) {
        clearInterval(arenaTickTimer);
        arenaTickTimer = null;
      }
      startTickLoop();
      showSpecialNoticeBanner('⚡ [자동 전투 전환] 양측 모두 AI로 전환되어 고속 자동 전투가 진행됩니다!', 'rgba(239, 68, 68, 0.95)', 2500);
      renderBattleArena();
    });
  }

  if (btnStep) {
    btnStep.addEventListener('click', () => {
      if (btnStep.disabled) return;
      if (!activeArenaEngine || !isBattleStarted) return;
      const turnCount = activeArenaEngine.state ? activeArenaEngine.state.turnCount : 0;
      if (turnCount < 100) return;

      // 100턴 이후 8배속 자동 전투 전환
      closeCardModal();
      isAutoBattleActive = true;
      activeArenaEngine.manualPlayerPass = false;
      activeArenaEngine.state.teamA.isPlayer = false;
      currentSpeed = 8;
      updateSpeedButtonText();
      isPaused = false;
      isManualTargeting = false;
      if (targetingOverlay) targetingOverlay.style.display = 'none';
      if (activeArenaEngine.triggerAutoTurnIfNeeded) {
        activeArenaEngine.triggerAutoTurnIfNeeded();
      }
      if (arenaTickTimer) {
        clearInterval(arenaTickTimer);
        arenaTickTimer = null;
      }
      startTickLoop();
      showSpecialNoticeBanner('⚡ [8배속 자동 전투 전환] 100턴 도달로 자동 전투가 8배속으로 진행됩니다!', 'rgba(239, 68, 68, 0.95)', 2500);
      renderBattleArena();
    });
  }

  if (btnSurrender) {
    btnSurrender.addEventListener('click', () => {
      if (!activeArenaEngine || !isBattleStarted) {
        if (confirm('전투를 종료하시겠습니까?')) {
          window.isBattleSurrendered = true;
          handleBattleExit();
        }
        return;
      }
      if (confirm('전투를 포기하시겠습니까?')) {
        if (arenaTickTimer) {
          clearInterval(arenaTickTimer);
          arenaTickTimer = null;
        }
        isBattleStarted = false;
        isPaused = false;
        closeCardModal();
        window.lastBattleResult = 'PLAYER_LOSS';
        window.isBattleSurrendered = true;
        handleBattleExit();
      }
    });
  }

  if (btnSpeed) {
    btnSpeed.addEventListener('click', cycleBattleSpeed);
  }

  if (btnStats) {
    btnStats.addEventListener('click', openStatsModal);
  }

  if (btnCloseStats) {
    btnCloseStats.addEventListener('click', closeStatsModal);
  }

  if (btnCloseCardModal) {
    btnCloseCardModal.addEventListener('click', () => {
      toggleBattlefieldSurvey(true);
    });
  }

  const btnSurvey = document.getElementById('btn-arena-survey');
  if (btnSurvey) {
    btnSurvey.addEventListener('click', () => {
      toggleBattlefieldSurvey(true);
    });
  }

  const btnSurveyReturn = document.getElementById('btn-arena-survey-return');
  if (btnSurveyReturn) {
    btnSurveyReturn.addEventListener('click', () => {
      toggleBattlefieldSurvey(false);
    });
  }

  // Deck Buttons & Modal Bindings
  const btnDeckDraw = document.getElementById('btn-arena-deck-draw');
  const btnDeckDiscard = document.getElementById('btn-arena-deck-discard');
  const btnCloseDeckModal = document.getElementById('btn-close-deck-modal');
  const btnDeckTabDraw = document.getElementById('btn-deck-tab-draw');
  const btnDeckTabDiscard = document.getElementById('btn-deck-tab-discard');
  const btnDeckTeamPlayer = document.getElementById('btn-deck-team-player');
  const btnDeckTeamEnemy = document.getElementById('btn-deck-team-enemy');
  const deckModal = document.getElementById('arena-deck-modal');
  const cardZoomModal = document.getElementById('arena-card-zoom-modal');
  const btnCloseCardZoom = document.getElementById('btn-close-card-zoom');

  if (btnDeckDraw) {
    btnDeckDraw.addEventListener('click', () => openArenaDeckModal('draw', 'player'));
  }
  if (btnDeckDiscard) {
    btnDeckDiscard.addEventListener('click', () => openArenaDeckModal('discard', 'player'));
  }
  if (btnCloseDeckModal) {
    btnCloseDeckModal.addEventListener('click', closeArenaDeckModal);
  }
  if (deckModal) {
    deckModal.addEventListener('click', (e) => {
      if (e.target === deckModal) closeArenaDeckModal();
    });
  }
  if (btnDeckTabDraw) {
    btnDeckTabDraw.addEventListener('click', () => {
      activeDeckTab = 'draw';
      renderArenaDeckModal();
    });
  }
  if (btnDeckTabDiscard) {
    btnDeckTabDiscard.addEventListener('click', () => {
      activeDeckTab = 'discard';
      renderArenaDeckModal();
    });
  }
  if (btnDeckTeamPlayer) {
    btnDeckTeamPlayer.addEventListener('click', () => {
      activeDeckTeam = 'player';
      renderArenaDeckModal();
    });
  }
  if (btnDeckTeamEnemy) {
    btnDeckTeamEnemy.addEventListener('click', () => {
      activeDeckTeam = 'enemy';
      renderArenaDeckModal();
    });
  }
  if (btnCloseCardZoom) {
    btnCloseCardZoom.addEventListener('click', closeCardZoomModal);
  }
  if (cardZoomModal) {
    cardZoomModal.addEventListener('click', (e) => {
      if (e.target === cardZoomModal || e.target.closest('.card-zoom-close-btn') || e.target.closest('.zoom-close-hint')) {
        closeCardZoomModal();
      }
    });
  }

  if (btnCancelTargeting) {
    btnCancelTargeting.addEventListener('click', () => {
      cancelTargetingMode();
    });
  }

  if (btnRestartResult) {
    btnRestartResult.addEventListener('click', () => {
      closeResultModal();
      if (window.activeBattleContext) {
        startBattleWithConfig(window.activeBattleContext);
      } else {
        startFreshBattle(false);
      }
    });
  }

  if (btnExitResult) {
    btnExitResult.addEventListener('click', () => {
      closeResultModal();
      handleBattleExit();
    });
  }

  const btnResultAnalysis = document.getElementById('btn-battle-result-analysis');
  if (btnResultAnalysis) {
    btnResultAnalysis.addEventListener('click', () => {
      openStatsModal();
    });
  }

  const btnCloseRscModal = document.getElementById('btn-close-rsc-modal');
  if (btnCloseRscModal) {
    btnCloseRscModal.addEventListener('click', () => {
      closeRedSuperchatModal();
    });
  }

  // Keyboard shortcut: ESC to cancel targeting mode or close modals
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const charModal = document.getElementById('char-info-modal');
      if (charModal && charModal.classList.contains('show')) {
        charModal.classList.remove('show');
        if (typeof window._onCharInfoModalClosed === 'function') {
          window._onCharInfoModalClosed();
        }
        return;
      }
      if (isManualTargeting) {
        cancelTargetingMode();
      }
      closeTypeAdvantageModal();
    }
  });
}

/**
 * Start a brand new 8vs8 Battle in the Arena
 * @param {boolean} autoStart - Whether to automatically start ticks immediately (default false)
 */
export function startFreshBattle(autoStart = false) {
  window.isBattleActive = true;
  if (arenaTickTimer) {
    clearInterval(arenaTickTimer);
    arenaTickTimer = null;
  }

  isPaused = false;
  isBattleStarted = false;
  currentSpeed = 1;
  isManualTargeting = false;
  selectedHandCard = null;
  pendingCardSelection = null;
  damageStats = { TEAM_A: {}, TEAM_B: {} };

  updateSpeedButtonText();
  updatePlayPauseButton();

  const btnAutoResolve = document.getElementById('btn-arena-auto-resolve');
  if (btnAutoResolve) {
    btnAutoResolve.style.display = 'none';
    btnAutoResolve.disabled = false;
    btnAutoResolve.textContent = '⚡ 잔여 자동 전투 전환';
  }

  // Create 8 vs 8 teams
  const { charsA, charsB } = generate8vs8Teams();
  const allChars = [...charsA, ...charsB];
  const { skillsMasterMap, keywordsMasterMap } = buildMasterMaps(allChars);

  const teamA = createTeamState('TEAM_A', true, charsA);
  const teamB = createTeamState('TEAM_B', false, charsB);

  // Initialize comprehensive battle stats tracker (10 Metrics)
  allChars.forEach(c => {
    damageStats[c.teamId][c.characterId] = {
      name: c.name,
      characterType: c.characterType,
      mainRole: c.mainRole,
      level: c.level || 1,
      star: c.star || 1,
      raw: c.raw,
      damageDealt: 0,
      damageTaken: 0,
      shieldGiven: 0,
      healingDone: 0,
      evasionCount: 0,
      cardsUsed: 0,
      overheatTotal: 0,
      ultCount: 0,
      killCount: 0,
      critCount: 0
    };
  });

  activeArenaEngine = new BattleEngine(teamA, teamB, {
    seed: Math.floor(Math.random() * 1000000),
    skillsMasterMap,
    keywordsMasterMap,
    manualPlayerPass: true
  });
  window.activeArenaEngine = activeArenaEngine;

  bindEngineEvents(activeArenaEngine);
  activeArenaEngine.initBattle();
  preloadBattleCutsceneImages(teamA, teamB);

  isAutoBattleActive = false;

  const btnStart = document.getElementById('btn-arena-start');
  if (btnStart) {
    btnStart.style.display = 'inline-flex';
    btnStart.textContent = '⚔️ 전투 시작';
    btnStart.classList.add('ready-to-start');
  }

  updateStepButtonState();
  playBattleBgm();

  if (autoStart) {
    beginBattle();
  } else {
    renderBattleArena();
  }
}

/**
 * Begin battle ticks and update UI state
 */
export function beginBattle() {
  if (!activeArenaEngine || isBattleStarted) return;
  isBattleStarted = true;

  const btnStart = document.getElementById('btn-arena-start');
  if (btnStart) {
    if (window.activeBattleContext) {
      btnStart.style.display = 'none';
    } else {
      btnStart.style.display = 'inline-flex';
      btnStart.textContent = '🔄 전투 재시작';
      btnStart.classList.remove('ready-to-start');
    }
  }

  updateStepButtonState();

  try {
    renderBattleArena();
  } catch (err) {
    console.error('Error during initial renderBattleArena in beginBattle:', err);
  }
  startTickLoop();
}

/**
 * Bind all visual and event listeners to the battle engine
 */
function bindEngineEvents(engine) {
  engine.on('tick', () => {
    renderGauges();
  });

  engine.on('turnStart', ({ teamId, turnCount }) => {
    renderBattleArena();
    showTurnBanner(teamId, turnCount);
  });

  let lastPlayedCardWasUltimate = false;

  engine.on('playerTurnWaiting', ({ team, hand, isQuickExtraTurn }) => {
    renderBattleArena();
    const rscModal = document.getElementById('arena-rsc-modal');
    if (rscModal && rscModal.classList.contains('active')) {
      pendingCardSelection = { hand, isQuickExtraTurn };
      return;
    }

    if (isQuickExtraTurn) {
      // Quick Ultimate waits for 4.5s cutscene; Quick Basic/Unique waits for 1.9s (slightly longer than 1.65s floating text)
      const delayMs = lastPlayedCardWasUltimate ? 4500 : 1900;
      setTimeout(() => {
        const rscModalNow = document.getElementById('arena-rsc-modal');
        if (rscModalNow && rscModalNow.classList.contains('active')) {
          pendingCardSelection = { hand, isQuickExtraTurn: true };
          return;
        }
        if (activeArenaEngine && (activeArenaEngine.state.battlePhase === BattlePhase.CARD_SELECTION || activeArenaEngine.state.battlePhase === 'CARD_SELECTION')) {
          openCardSelectionModal(hand, true);
        }
        lastPlayedCardWasUltimate = false;
      }, delayMs);
    } else {
      lastPlayedCardWasUltimate = false;
      openCardSelectionModal(hand, false);
    }
  });

  engine.on('turnEnd', () => {
    renderGauges();
    renderBattleArena();
  });

  engine.on('cardPlayed', (data) => {
    const isUltimate = (data.card?.cardType === CardType.ULTIMATE || data.card?.skillData?.Skill_Type === '비기' || data.card?.skillData?.Skill_Type === '궁극기');
    lastPlayedCardWasUltimate = isUltimate;
    if (isUltimate && data.owner) {
      triggerUltimateCutscene(data);
    } else if (data.owner) {
      triggerSkillNameplateBanner(data);
    }
    // Battle 11: Play skill sound with priority rules
    playSkillSoundWithRules(data.card, data.owner, false);

    if (data.owner && damageStats[data.team?.teamId]?.[data.owner.characterId]) {
      const s = damageStats[data.team.teamId][data.owner.characterId];
      s.cardsUsed += 1;
      s.overheatTotal += (data.cardOverheat || 0);
      if (isUltimate) s.ultCount += 1;
    }
  });

  engine.on('quickCardPlayed', (data) => {
    // 12 o'clock toast disabled per user request
  });

  engine.on('counterTriggered', (data) => {
    const counterUnit = data.counterUnit || data.defender;
    triggerSkillNameplateBanner({
      owner: counterUnit,
      skillName: '반격',
      isCounter: true,
      team: { teamId: counterUnit?.teamId }
    });
    // Battle 11: Counter attack sound with CS_Skill_Sound priority
    playSkillSoundWithRules(data.counterSkill || null, counterUnit, true);
  });

  engine.on('damage', (data) => {
    // 0. Counter attack is staggered by 360ms to provide clear sequential visual feedback
    if (data.isCounter) {
      setTimeout(() => {
        renderBattleArena();
        if (data.attacker) {
          const atkEl = document.getElementById(`unit-card-${data.attacker.characterId}`);
          if (atkEl) {
            const isTeamA = (data.attacker.teamId === 'TEAM_A');
            const attackClass = isTeamA ? 'unit-attacking-down' : 'unit-attacking-up';
            atkEl.classList.remove('unit-attacking', 'unit-attacking-up', 'unit-attacking-down');
            void atkEl.offsetWidth;
            atkEl.classList.add(attackClass);
            const atkId = data.attacker.characterId;
            setTimeout(() => {
              const curAtk = document.getElementById(`unit-card-${atkId}`);
              curAtk?.classList.remove(attackClass, 'unit-attacking', 'unit-attacking-up', 'unit-attacking-down');
            }, 320);
          }
        }
        if (data.target) {
          const targetEl = document.getElementById(`unit-card-${data.target.characterId}`);
          if (targetEl) {
            targetEl.classList.remove('unit-hit-shake', 'unit-hit-flash');
            void targetEl.offsetWidth;
            targetEl.classList.add('unit-hit-shake', 'unit-hit-flash');
            const tgtId = data.target.characterId;
            setTimeout(() => {
              const curTgt = document.getElementById(`unit-card-${tgtId}`);
              curTgt?.classList.remove('unit-hit-shake', 'unit-hit-flash');
            }, 450);

            if (!data.isHit) {
              spawnFloatingNumber(targetEl, 'MISS', '#94a3b8', 1.2);
            } else if (data.shieldDamage > 0 && data.hpDamage <= 0) {
              spawnFloatingNumber(targetEl, `♻️ 반격 🔘 -${data.shieldDamage}`, '#10b981', 1.25);
            } else if (data.shieldDamage > 0 && data.hpDamage > 0) {
              spawnFloatingNumber(targetEl, `♻️ 반격 -${data.hpDamage} (🔘-${data.shieldDamage})`, '#10b981', 1.35);
            } else if (data.hpDamage > 0) {
              spawnFloatingNumber(targetEl, `♻️ 반격 -${data.hpDamage}`, '#10b981', 1.35);
            } else {
              spawnFloatingNumber(targetEl, `♻️ 반격 -${data.amount || 0}`, '#10b981', 1.35);
            }
          }
          if (data.attacker && damageStats[data.attacker.teamId]?.[data.attacker.characterId]) {
            damageStats[data.attacker.teamId][data.attacker.characterId].damageDealt += (data.amount || 0);
          }
          if (damageStats[data.target.teamId]?.[data.target.characterId]) {
            damageStats[data.target.teamId][data.target.characterId].damageTaken += (data.amount || 0);
          }
        }
      }, 360);
      return;
    }

    // 1. Re-render arena immediately to reflect new HP/Shield/Break stats
    renderBattleArena();

    // 2. Trigger combat visual feedback & floating text
    if (data.target) {
      const targetEl = document.getElementById(`unit-card-${data.target.characterId}`);
      const isCrit = !!data.isCritical;
      const isMiss = !data.isHit;
      const isMagic = data.damageType === 'MAGIC';

      if (isMiss) {
        spawnFloatingNumber(targetEl, 'MISS', '#94a3b8', 1.0);
        playAssetSound('asset_021');
      } else {
        // Target hit feedback (Shake + Red Flash)
        if (targetEl) {
          targetEl.classList.remove('unit-hit-shake', 'unit-hit-flash');
          void targetEl.offsetWidth; // Force CSS reflow
          targetEl.classList.add('unit-hit-shake', 'unit-hit-flash');
          const tgtId = data.target.characterId;
          setTimeout(() => {
            const curTgt = document.getElementById(`unit-card-${tgtId}`) || targetEl;
            curTgt?.classList.remove('unit-hit-shake', 'unit-hit-flash');
          }, 450);
        }

        // Shield absorption floating text (🔘)
        if (data.shieldDamage > 0) {
          spawnFloatingNumber(targetEl, `🔘 -${data.shieldDamage}`, '#38bdf8', 1.0);
        }
        // HP damage floating text
        if (data.hpDamage > 0 || data.amount === 0) {
          let dmgColor = isCrit ? '#facc15' : (isMagic ? '#c084fc' : '#ff4757');
          let dmgPrefix = isCrit ? '💥 CRIT -' : (isMagic ? '🔮 -' : '⚔️ -');
          const dmgText = `${dmgPrefix}${data.hpDamage}`;
          if (data.shieldDamage > 0) {
            setTimeout(() => {
              const liveTarget = document.getElementById(`unit-card-${data.target.characterId}`) || targetEl;
              spawnFloatingNumber(liveTarget, dmgText, dmgColor, isCrit ? 1.35 : 1.05);
            }, 120);
          } else {
            spawnFloatingNumber(targetEl, dmgText, dmgColor, isCrit ? 1.35 : 1.05);
          }
        }
        // Break / Breaking floating text
        if (data.isBreaking) {
          setTimeout(() => {
            const liveTarget = document.getElementById(`unit-card-${data.target.characterId}`) || targetEl;
            spawnFloatingNumber(liveTarget, '💥 BREAKING!', '#ef4444', 1.4);
          }, 180);
        } else if (data.isBreak) {
          setTimeout(() => {
            const liveTarget = document.getElementById(`unit-card-${data.target.characterId}`) || targetEl;
            spawnFloatingNumber(liveTarget, '⚡ BREAK!', '#f59e0b', 1.25);
          }, 150);
        }
      }

      // Track stats
      if (data.attacker && damageStats[data.attacker.teamId]?.[data.attacker.characterId]) {
        const as = damageStats[data.attacker.teamId][data.attacker.characterId];
        as.damageDealt += (data.amount || 0);
        if (isCrit) as.critCount += 1;
      }
      if (damageStats[data.target.teamId]?.[data.target.characterId]) {
        const ts = damageStats[data.target.teamId][data.target.characterId];
        ts.damageTaken += (data.amount || 0);
        if (isMiss) ts.evasionCount += 1;
      }
    }

    // Directional Attacker nod animation
    if (data.attacker) {
      const atkEl = document.getElementById(`unit-card-${data.attacker.characterId}`);
      if (atkEl) {
        const isTeamA = (data.attacker.teamId === 'TEAM_A');
        const attackClass = isTeamA ? 'unit-attacking-down' : 'unit-attacking-up';
        atkEl.classList.remove('unit-attacking', 'unit-attacking-up', 'unit-attacking-down');
        void atkEl.offsetWidth;
        atkEl.classList.add(attackClass);
        const atkId = data.attacker.characterId;
        setTimeout(() => {
          const curAtk = document.getElementById(`unit-card-${atkId}`) || atkEl;
          curAtk?.classList.remove(attackClass, 'unit-attacking', 'unit-attacking-up', 'unit-attacking-down');
        }, 320);
      }
    }
  });

  engine.on('shield_absorb', (data) => {
    if (data.target) {
      const targetEl = document.getElementById(`unit-card-${data.target.characterId}`);
      spawnFloatingNumber(targetEl, `🔘 -${data.amount}`, '#38bdf8', 1.0);
    }
    renderBattleArena();
  });

  engine.on('shield_applied', (data) => {
    renderBattleArena();
    if (data.caster && damageStats[data.caster.teamId]?.[data.caster.characterId]) {
      damageStats[data.caster.teamId][data.caster.characterId].shieldGiven += (data.amount || 0);
    }
    if (data.target) {
      const targetEl = document.getElementById(`unit-card-${data.target.characterId}`);
      if (targetEl) {
        targetEl.classList.remove('unit-shield-pulse');
        void targetEl.offsetWidth;
        targetEl.classList.add('unit-shield-pulse');
        setTimeout(() => {
          targetEl?.classList.remove('unit-shield-pulse');
        }, 500);
      }
      spawnFloatingNumber(targetEl, `🔘 +${data.amount} 보호막`, '#38bdf8', 1.15);
    }
  });

  engine.on('status_applied', (data) => {
    if (data.target) {
      const targetEl = document.getElementById(`unit-card-${data.target.characterId}`);
      const kw = data.keyword || {};
      const kwName = kw.Keyword_Name || kw.name || '효과';
      const isDebuff = (kw.Keyword_Type === '디버프' || kw.type === 'DEBUFF');
      const icon = kw.Keyword_Icon || (isDebuff ? '🔻' : '🔼');
      const color = isDebuff ? '#fb923c' : '#38bdf8';
      const stackText = data.stack > 1 ? ` ${data.stack}` : '';
      spawnFloatingNumber(targetEl, `${icon} ${kwName}${stackText}`, color, 1.05);
    }
    renderBattleArena();
  });

  engine.on('status_cleansed', (data) => {
    if (data.target) {
      const targetEl = document.getElementById(`unit-card-${data.target.characterId}`);
      spawnFloatingNumber(targetEl, `💠 정화! (-${data.clearedCount || 1} 디버프)`, '#38bdf8', 1.25);
    }
    renderBattleArena();
  });

  engine.on('heal', (data) => {
    renderBattleArena();
    if (data.target) {
      const targetEl = document.getElementById(`unit-card-${data.target.characterId}`);
      if (targetEl) {
        targetEl.classList.remove('unit-heal-glow');
        void targetEl.offsetWidth;
        targetEl.classList.add('unit-heal-glow');
        setTimeout(() => {
          targetEl?.classList.remove('unit-heal-glow');
        }, 500);
      }
      spawnFloatingNumber(targetEl, `💚 +${data.amount}`, '#22c55e', 1.2);

      if (data.caster && damageStats[data.caster.teamId]?.[data.caster.characterId]) {
        damageStats[data.caster.teamId][data.caster.characterId].healingDone += (data.amount || 0);
      }
    }
  });

  engine.on('break', (data) => {
    if (data.target) {
      const targetEl = document.getElementById(`unit-card-${data.target.characterId}`);
      spawnFloatingNumber(targetEl, `⚡ BREAK!`, '#f59e0b', 1.2);
    }
    renderBattleArena();
  });

  engine.on('breaking', (data) => {
    if (data.target) {
      const targetEl = document.getElementById(`unit-card-${data.target.characterId}`);
      spawnFloatingNumber(targetEl, `💥 BREAKING!`, '#ef4444', 1.4);
      if (targetEl) {
        targetEl.classList.add('unit-shake-heavy');
        setTimeout(() => targetEl.classList.remove('unit-shake-heavy'), 600);
      }
    }
    renderBattleArena();
  });

  engine.on('characterDead', (char) => {
    if (char) {
      const targetEl = document.getElementById(`unit-card-${char.characterId}`);
      spawnFloatingNumber(targetEl, `☠️ DEATH`, '#e74c3c', 1.3);

      if (char.lastAttacker && damageStats[char.lastAttacker.teamId]?.[char.lastAttacker.characterId]) {
        damageStats[char.lastAttacker.teamId][char.lastAttacker.characterId].killCount += 1;
      }
    }
    renderBattleArena();
  });

  engine.on('characterRevived', ({ character, hp }) => {
    if (character) {
      const targetEl = document.getElementById(`unit-card-${character.characterId}`);
      if (targetEl) {
        targetEl.classList.remove('unit-heal-glow');
        void targetEl.offsetWidth;
        targetEl.classList.add('unit-heal-glow');
        setTimeout(() => targetEl?.classList.remove('unit-heal-glow'), 500);
        spawnFloatingNumber(targetEl, `💖 부활! +${hp} HP`, '#ec4899', 1.4);
      }
      showSpecialNoticeBanner(`💖 [부활!] ${character.name}이(가) 기사회생했습니다! (+${hp} HP)`, 'rgba(236, 72, 153, 0.95)', 2200);
    }
    renderBattleArena();
  });

  engine.on('redSuperchat', (data) => {
    showRedSuperchatModal(data);
    renderBattleArena();
  });

  // 2차 키워드 특수 기믹 알림 리스너
  engine.on('tarotDrawn', (data) => {
    showTarotAnnouncement(data);
  });

  engine.on('diceRolled', (data) => {
    showSpecialNoticeBanner(data.message || `🎲 [다이스] 결과!`, data.isSnakeEyes ? 'rgba(234, 179, 8, 0.95)' : 'rgba(59, 130, 246, 0.95)');
    if (data.character) {
      const charEl = document.querySelector(`.arena-unit-card[data-character-id="${data.character.characterId}"]`);
      if (charEl) {
        if (data.isSnakeEyes) {
          charEl.classList.add('snake-eyes-glow');
          setTimeout(() => charEl.classList.remove('snake-eyes-glow'), 2500);
        }
      }
    }
  });

  engine.on('slotMachineJackpot', (data) => {
    showSpecialNoticeBanner(data.message || `🎰 [슬롯머신 잭팟!]`, 'rgba(236, 72, 153, 0.95)');
  });

  engine.on('moonPhaseChanged', (data) => {
    showSpecialNoticeBanner(data.message || `🌕 [달의 변화]`, 'rgba(245, 158, 11, 0.95)');
    renderBattleArena();
  });

  engine.on('riddleResult', (data) => {
    showSpecialNoticeBanner(data.message || `❔ [수수께끼 결과]`, data.isCorrect ? 'rgba(16, 185, 129, 0.95)' : 'rgba(239, 68, 68, 0.95)');
    if (data.character) {
      const charEl = document.querySelector(`.arena-unit-card[data-character-id="${data.character.characterId}"]`);
      if (charEl) {
        if (data.isCorrect) {
          charEl.classList.add('card-riddle-correct');
          spawnFloatingNumber(charEl, '🎉 정답!', '#10b981', 1.35);
          setTimeout(() => charEl.classList.remove('card-riddle-correct'), 2000);
        } else {
          charEl.classList.add('card-riddle-wrong');
          spawnFloatingNumber(charEl, '❌ 오답!', '#ef4444', 1.35);
        }
      }
    }
  });

  engine.on('deckShuffled', (data) => {
    if (data.teamId !== 'TEAM_A') {
      if (window.isDeckModalOpen && typeof window.refreshArenaDeckModal === 'function') {
        window.refreshArenaDeckModal();
      }
      return;
    }

    // Only player's (TEAM_A) deck shuffle: sound and deck button animations only
    playAssetSound('asset_020');

    const btnDraw = document.getElementById('btn-arena-deck-draw');
    const btnDiscard = document.getElementById('btn-arena-deck-discard');
    if (btnDraw) {
      btnDraw.classList.remove('deck-anim-shuffle');
      void btnDraw.offsetWidth;
      btnDraw.classList.add('deck-anim-shuffle');
      setTimeout(() => btnDraw?.classList.remove('deck-anim-shuffle'), 700);
    }
    if (btnDiscard) {
      btnDiscard.classList.remove('deck-anim-shuffle');
      void btnDiscard.offsetWidth;
      btnDiscard.classList.add('deck-anim-shuffle');
      setTimeout(() => btnDiscard?.classList.remove('deck-anim-shuffle'), 700);
    }

    updateDeckHudCounts();
    if (window.isDeckModalOpen && typeof window.refreshArenaDeckModal === 'function') {
      window.refreshArenaDeckModal();
    }
  });

  engine.on('battleEnd', ({ result }) => {
    if (arenaTickTimer) {
      clearInterval(arenaTickTimer);
      arenaTickTimer = null;
    }
    renderBattleArena();
    setTimeout(() => {
      showBattleResultModal(result);
    }, 1200);
  });
}

/**
 * Main Tick advancement timer
 */
function startTickLoop() {
  if (arenaTickTimer) clearInterval(arenaTickTimer);

  const intervalMs = Math.max(120, Math.floor(2500 / currentSpeed));
  arenaTickTimer = setInterval(() => {
    if (!isBattleStarted || isPaused || isManualTargeting) return;
    if (!activeArenaEngine) return;

    if (activeArenaEngine.state.battlePhase === 'BATTLE_END') {
      clearInterval(arenaTickTimer);
      arenaTickTimer = null;
      return;
    }

    // If waiting for player input, pause tick loop until player acts
    if (activeArenaEngine.state.battlePhase === 'CARD_SELECTION') {
      const currentTeam = activeArenaEngine.state.currentTurnOwner === 'TEAM_A' ? activeArenaEngine.state.teamA : activeArenaEngine.state.teamB;
      if (currentTeam && currentTeam.isPlayer) {
        return;
      } else {
        if (activeArenaEngine.triggerAutoTurnIfNeeded) {
          activeArenaEngine.triggerAutoTurnIfNeeded();
        }
      }
    }

    activeArenaEngine.advanceTick();
    renderGauges();
    renderBattleArena();
  }, intervalMs);
}

/**
 * Cycle battle speed 1x -> 2x -> 4x -> 8x
 */
function cycleBattleSpeed() {
  if (currentSpeed === 1) currentSpeed = 2;
  else if (currentSpeed === 2) currentSpeed = 4;
  else if (currentSpeed === 4) currentSpeed = 8;
  else currentSpeed = 1;

  updateSpeedButtonText();
  startTickLoop();
}

function updateSpeedButtonText() {
  const btnSpeed = document.getElementById('btn-arena-speed');
  if (btnSpeed) {
    btnSpeed.textContent = `${currentSpeed}x`;
  }
}

export function updatePlayPauseButton() {
  // Play/Pause button was removed from HUD per user request
}

/**
 * Update 100-turn Step button: initially locked, becomes 8x auto-battle button at turn >= 100
 */
export function updateStepButtonState() {
  const btnStep = document.getElementById('btn-arena-step');
  if (!btnStep) return;
  if (!activeArenaEngine || !isBattleStarted) {
    btnStep.disabled = true;
    btnStep.style.opacity = '0.4';
    btnStep.style.cursor = 'not-allowed';
    btnStep.title = '100턴 이후 자동 전투로 전환 가능';
    btnStep.innerHTML = '⏱️';
    btnStep.style.width = '';
    btnStep.style.padding = '';
    btnStep.style.borderRadius = '';
    btnStep.style.fontWeight = '';
    btnStep.style.fontSize = '';
    btnStep.style.background = '';
    btnStep.style.color = '';
    btnStep.style.border = '';
    return;
  }

  const s = activeArenaEngine.state;
  const isOver100Turns = (s && s.turnCount >= 100);
  if (isOver100Turns && s.battlePhase !== 'BATTLE_END') {
    if (!activeArenaEngine.state.teamA.isPlayer) {
      btnStep.disabled = true;
      btnStep.style.opacity = '0.7';
      btnStep.style.cursor = 'default';
      btnStep.title = '자동 전투 진행 중 (8배속)';
      btnStep.innerHTML = '⚡ 자동 전투 중 (8x)';
    } else {
      btnStep.disabled = false;
      btnStep.style.opacity = '1';
      btnStep.style.cursor = 'pointer';
      btnStep.title = '8배속 고속 자동 전투로 전환합니다';
      btnStep.innerHTML = '⚡ 자동 전투 (8x)';
    }
    btnStep.style.width = 'auto';
    btnStep.style.padding = '0 10px';
    btnStep.style.borderRadius = '9999px';
    btnStep.style.fontWeight = '800';
    btnStep.style.fontSize = '0.78rem';
    btnStep.style.background = 'linear-gradient(135deg, #f59e0b, #ef4444)';
    btnStep.style.color = '#fff';
    btnStep.style.border = '1px solid #f97316';
  } else {
    btnStep.disabled = true;
    btnStep.style.opacity = '0.4';
    btnStep.style.cursor = 'not-allowed';
    btnStep.title = '100턴 이후 자동 전투로 전환 가능';
    btnStep.innerHTML = '⏱️';
    btnStep.style.width = '';
    btnStep.style.padding = '';
    btnStep.style.borderRadius = '';
    btnStep.style.fontWeight = '';
    btnStep.style.fontSize = '';
    btnStep.style.background = '';
    btnStep.style.color = '';
    btnStep.style.border = '';
  }
}

/**
 * Toggle between the Player Arena view and Developer Debug view
 */
export function toggleDebugHarnessView() {
  const arenaView = document.getElementById('battle-arena-view');
  const debugView = document.getElementById('battle-debug-view');
  if (!arenaView || !debugView) return;

  const isArenaVisible = (arenaView.style.display !== 'none');
  if (isArenaVisible) {
    arenaView.style.display = 'none';
    debugView.style.display = 'block';
  } else {
    debugView.style.display = 'none';
    arenaView.style.display = 'flex';
    renderBattleArena();
  }
}

/**
 * Render the entire 8 vs 8 Arena
 */
export function renderBattleArena() {
  if (!activeArenaEngine) return;
  const s = activeArenaEngine.state;

  // Update Deck HUD counts
  updateDeckHudCounts();

  // Update Turn header
  const turnLabel = document.getElementById('arena-turn-count');
  if (turnLabel) {
    turnLabel.textContent = isBattleStarted ? `TURN ${s.turnCount || 1}` : '전투 대기';
  }

  // Update Phase Pill
  const phasePill = document.getElementById('arena-phase-pill');
  if (phasePill) {
    if (!isBattleStarted) {
      phasePill.textContent = '전투 대기중';
      phasePill.style.background = '#475569';
    } else {
      let phaseText = '전투 진행중';
      let phaseColor = '#3b82f6';
      if (s.battlePhase === 'TURN_EXECUTION') {
        phaseText = s.currentTurnTeamId === 'TEAM_A' ? '아군 턴 (ACTION)' : '적군 턴 (ACTION)';
        phaseColor = s.currentTurnTeamId === 'TEAM_A' ? '#10b981' : '#f97316';
      } else if (s.battlePhase === 'COUNTER_PHASE') {
        phaseText = '카운터 페이즈';
        phaseColor = '#8b5cf6';
      } else if (s.battlePhase === 'BATTLE_END') {
        phaseText = s.battleResult === 'PLAYER_WIN' ? '승리!' : '패배';
        phaseColor = s.battleResult === 'PLAYER_WIN' ? '#10b981' : '#ef4444';
      }
      phasePill.textContent = phaseText;
      phasePill.style.background = phaseColor;
    }
  }

  // Update 100+ turns step button state
  updateStepButtonState();

  // Render Gauges
  renderGauges();

  // Preserve active animation classes across DOM rebuilds so animations are not abruptly aborted
  const animClassesToPreserve = [
    'unit-hit-shake',
    'unit-hit-flash',
    'unit-attacking',
    'unit-attacking-up',
    'unit-attacking-down',
    'unit-heal-glow',
    'unit-shield-pulse'
  ];
  const activeAnimations = {};
  document.querySelectorAll('.arena-unit-card').forEach(el => {
    if (el.id) {
      const active = animClassesToPreserve.filter(c => el.classList.contains(c));
      if (active.length > 0) {
        activeAnimations[el.id] = active;
      }
    }
  });

  // Top Row: Player Team (TEAM_A)
  // Left: 3 Supporters (pos 6, 7, 8), Right: 5 Strikers (pos 1..5)
  const playerSupporters = (s.teamA.characters || []).filter(c => c.formationPosition >= 6).sort((a,b) => a.formationPosition - b.formationPosition);
  const playerStrikers = (s.teamA.characters || []).filter(c => c.formationPosition < 6).sort((a,b) => a.formationPosition - b.formationPosition);

  const elPlayerSupporters = document.getElementById('arena-player-supporters');
  const elPlayerStrikers = document.getElementById('arena-player-strikers');
  const safeRenderCards = (cards) => (cards || []).map(c => {
    try {
      return renderUnitCardHtml(c);
    } catch (err) {
      console.error(`[Arena Card Render Error] ${c?.name || c?.characterId}:`, err);
      return '';
    }
  }).join('');

  if (elPlayerSupporters) {
    elPlayerSupporters.innerHTML = safeRenderCards(playerSupporters);
  }
  if (elPlayerStrikers) {
    elPlayerStrikers.innerHTML = safeRenderCards(playerStrikers);
  }

  // Bottom Row: Enemy Team (TEAM_B)
  // Left: 5 Strikers (pos 1..5), Right: 3 Supporters (pos 6, 7, 8)
  const enemyStrikers = (s.teamB.characters || []).filter(c => c.formationPosition < 6).sort((a,b) => a.formationPosition - b.formationPosition);
  const enemySupporters = (s.teamB.characters || []).filter(c => c.formationPosition >= 6).sort((a,b) => a.formationPosition - b.formationPosition);

  const elEnemyStrikers = document.getElementById('arena-enemy-strikers');
  const elEnemySupporters = document.getElementById('arena-enemy-supporters');

  if (elEnemyStrikers) {
    elEnemyStrikers.innerHTML = safeRenderCards(enemyStrikers);
  }
  if (elEnemySupporters) {
    elEnemySupporters.innerHTML = safeRenderCards(enemySupporters);
  }

  // Restore preserved animation classes to newly rendered DOM elements
  Object.keys(activeAnimations).forEach(id => {
    const newEl = document.getElementById(id);
    if (newEl) {
      activeAnimations[id].forEach(c => newEl.classList.add(c));
    }
  });

  // Attach interactive click handlers to cards for targeting and notch hover
  attachUnitCardInteractions();
}

/**
 * Render Vertical Team Speed Gauges (0 ~ 200)
 */
function renderGauges() {
  if (!activeArenaEngine) return;
  const s = activeArenaEngine.state;

  const reqA = s.teamA.turnRequirement || 200;
  const reqB = s.teamB.turnRequirement || 200;
  const gaugeA = s.teamA.teamGauge || 0;
  const gaugeB = s.teamB.teamGauge || 0;

  const pctA = Math.min(100, Math.max(0, (gaugeA / reqA) * 100));
  const pctB = Math.min(100, Math.max(0, (gaugeB / reqB) * 100));

  const elGaugeFillA = document.getElementById('gauge-player-fill');
  const elGaugeTextA = document.getElementById('gauge-player-text');
  const elGaugeFillB = document.getElementById('gauge-enemy-fill');
  const elGaugeTextB = document.getElementById('gauge-enemy-text');

  if (elGaugeFillA) elGaugeFillA.style.height = `${pctA}%`;
  if (elGaugeTextA) elGaugeTextA.textContent = `${Math.floor(gaugeA)} / ${reqA}`;

  if (elGaugeFillB) elGaugeFillB.style.height = `${pctB}%`;
  if (elGaugeTextB) elGaugeTextB.textContent = `${Math.floor(gaugeB)} / ${reqB}`;
}

/**
 * Generate HTML string for an individual Character Unit Card
 */
export function renderUnitCardHtml(c) {
  const rawRoleStr = c.raw?.Character_Role || c.role || c.mainRole || '탱커';
  const rawRoleParts = String(rawRoleStr).split(/[\/,]/).map(s => s.trim()).filter(Boolean);
  const koreanRoles = rawRoleParts.map(r => getKoreanRoleName(r));
  const primaryRole = koreanRoles[0] || '탱커';
  // 스트라이커는 붉은색 테두리(#ef4444), 서포터는 푸른색 테두리(#3b82f6)로 직관적 구분
  const isStriker = (c.formationPosition <= 5) || (c.classType === '스트라이커' || c.classType === 'STRIKER');
  const borderColor = isStriker ? '#ef4444' : '#3b82f6';
  const starIconUrl = ATTR_ICONS[c.characterType] || ATTR_ICONS['청초'];

  // Portrait Art
  const raw = c.raw || {};
  const portraitUrl = raw.Character_Image_Long || raw.Character_Image_Full || raw.Character_Image || raw.Character_Portrait || '';

  // HP Bar Colors
  const hpPct = Math.max(0, Math.min(100, (c.hp / c.maxHp) * 100));
  let hpColor = '#22c55e'; // Green (>66%)
  if (hpPct <= 33) hpColor = '#ef4444'; // Red (<=33%)
  else if (hpPct <= 66) hpColor = '#f59e0b'; // Orange (<=66%)

  // Shield Bar %
  const currentShield = c.shield || 0;
  const shieldPct = Math.min(100, (currentShield / c.maxHp) * 100);

  // BP Bar %
  const bpPct = c.maxBreak > 0 ? Math.min(100, (c.currentBreak / c.maxBreak) * 100) : 0;

  // Red Superchat Badge
  const rscCount = c.redSuperchat ? 1 : 0;
  const rscHtml = rscCount > 0 ? `
    <div class="arena-card-rsc-badge">
      🧧 <span>각성</span>
      <div class="rsc-tooltip">
        <div style="font-weight:bold; color:#ff4757; margin-bottom:4px;">🔥 ${c.redSuperchat?.name || '아카스파 각성'}</div>
        <div>${c.redSuperchat?.description || getRedSuperchatDesc(c)}</div>
      </div>
    </div>
  ` : '';

  // Active Tarot Badge (P_S_040 점괘 상시 툴팁 확인 배지)
  const teamObj = c.team || (activeArenaEngine?.state?.teamA?.teamId === c.teamId ? activeArenaEngine?.state?.teamA : activeArenaEngine?.state?.teamB);
  const activeTarot = teamObj?.activeTarot;
  let tarotHtml = '';
  if (activeTarot) {
    let isAffected = true;
    let roleNotice = '';
    if (activeTarot.target === 'ROLE') {
      isAffected = Boolean(
        c.mainRole === activeTarot.targetRole ||
        c.subRole === activeTarot.targetRole ||
        (Array.isArray(c.roles) && c.roles.includes(activeTarot.targetRole)) ||
        (activeTarot.roleName && String(c.raw?.Character_Role || c.role || c.mainRole || '').includes(activeTarot.roleName))
      );
      roleNotice = isAffected
        ? `<div style="color:#4ade80; font-size:0.58rem; margin-top:3px;">✨ 적용 중 (+${activeTarot.roleName})</div>`
        : `<div style="color:#94a3b8; font-size:0.58rem; margin-top:3px;">(미적용: ${activeTarot.roleName} 전용)</div>`;
    } else if (activeTarot.target === 'SELF') {
      const hasFortune = Boolean(c.statusSlots?.some(s => s.keywordId === 'Key_039' || s.name === '점괘'));
      isAffected = hasFortune;
      roleNotice = isAffected
        ? `<div style="color:#f87171; font-size:0.58rem; margin-top:3px;">⚠️ 점괘 시전자 부여 완료</div>`
        : `<div style="color:#94a3b8; font-size:0.58rem; margin-top:3px;">(점괘 시전자 전용)</div>`;
    } else if (activeTarot.target === 'TEAM') {
      roleNotice = `<div style="color:#c084fc; font-size:0.58rem; margin-top:3px;">팀 전체 효과</div>`;
    }

    if (isAffected) {
      tarotHtml = `
        <div class="arena-card-tarot-badge tarot-affected">
          🔮 <span>${activeTarot.name.split(' ')[0]}</span>
          <div class="tarot-tooltip">
            <div style="font-weight:bold; color:#c084fc; margin-bottom:4px;">🔮 ${activeTarot.name}</div>
            <div>${activeTarot.desc}</div>
            ${roleNotice}
          </div>
        </div>
      `;
    }
  }

  const badgesRowHtml = (rscHtml || tarotHtml) ? `
    <div class="arena-card-badge-row">
      ${rscHtml}
      ${tarotHtml}
    </div>
  ` : '';

  // Status slots (up to 5 rows)
  const synergyTotals = {
    Key_002: getCharacterSynergyStackTotal(c, 'Key_002'),
    Key_003: getCharacterSynergyStackTotal(c, 'Key_003'),
    Key_004: getCharacterSynergyStackTotal(c, 'Key_004')
  };

  const statusSlotsHtml = (c.statusSlots || []).map(slot => {
    const isDebuff = (slot.category === 'DEBUFF' || slot.type === 'DEBUFF' || slot.rawKeyword?.Keyword_Type === '디버프');
    let accentColor = isDebuff ? '#ef4444' : '#38bdf8';

    // 10+ Stack Synergy check (Key_002, Key_003, Key_004)
    const slotGroup = getKeywordSynergyGroup(slot.keywordId, slot.name, slot.rawKeyword);
    const groupTotal = slotGroup ? (synergyTotals[slotGroup] || 0) : 0;
    const isSynergyMax = Boolean(slotGroup && groupTotal >= 10);
    const highlightClass = isSynergyMax ? `status-highlight-10 status-highlight-${slotGroup.toLowerCase()}` : '';

    let iconVal = slot.icon;
    if (!iconVal || iconVal === '🔻' || iconVal === '▼' || iconVal === '🔼') {
      if (slot.keywordId === 'Key_004' || slot.name === '화상' || slot.name === '화염') iconVal = '🔥';
      else if (slot.keywordId === 'Key_027' || slot.name === '면역') iconVal = '💎';
      else if (slot.keywordId === 'Key_011' || slot.name === '흑마법') iconVal = '🎆';
      else if (slot.keywordId === 'Key_013' || slot.name === '열정') iconVal = '⚔️';
      else if (slot.keywordId === 'Key_014' || slot.name === '청초') iconVal = '⚜️';
      else if (slot.keywordId === 'Key_015' || slot.name === '견고') iconVal = '🛡️';
      else if (slot.keywordId === 'Key_016' || slot.name === '의지') iconVal = '⛓️';
      else {
        const kwDef = (typeof getKeywordInfo === 'function' ? getKeywordInfo(slot.keywordId || slot.name) : null);
        iconVal = kwDef?.icon || kwDef?.Keyword_Icon || slot.icon || (isDebuff ? '🔻' : '🔼');
      }
    }
    const isUrl = typeof iconVal === 'string' && (iconVal.startsWith('http://') || iconVal.startsWith('https://') || iconVal.endsWith('.png') || iconVal.endsWith('.webp') || iconVal.endsWith('.svg'));
    const iconHtml = isUrl
      ? `<img src="${iconVal}" alt="${slot.name || ''}" style="width:18px;height:18px;object-fit:contain;vertical-align:middle;pointer-events:none;">`
      : `<span class="slot-icon-glyph" style="font-size:1.05rem;pointer-events:none;">${iconVal}</span>`;

    let stackText = isSynergyMax
      ? `<span class="slot-synergy-max-text">${slot.stack || 1}</span>`
      : String(slot.stack || 1);
    const isPermanent = Boolean(slot.isPermanent || (slot.duration >= 900));
    const durationText = isPermanent ? '∞' : `${slot.duration || 1}T`;
    const starHtml = slot.isImmortal ? '<span class="slot-immortal-star" style="color:#fbbf24; margin-left:1px; pointer-events:none;">★</span>' : '';

    const kwDesc = slot.rawKeyword?.Keyword_Desc
      || (window.GameData?.keyword?.find(k => k.Keyword_ID === slot.keywordId || k.Keyword_Name === slot.name)?.Keyword_Desc)
      || CORE_KEYWORDS[slot.keywordId]?.Keyword_Desc
      || slot.description
      || '키워드 효과 설명이 없습니다.';
    const cleanDesc = String(kwDesc).replace(/"/g, '&quot;');
    const safeName = String(slot.name || '키워드').replace(/"/g, '&quot;');
    const safeIcon = String(iconVal || (isDebuff ? '🔻' : '🔼')).replace(/"/g, '&quot;');

    return `
      <div class="arena-status-slot-row ${highlightClass}"
           style="border-left: 3px solid ${accentColor}; min-height:22px; padding:2px 5px; cursor:help; pointer-events:auto;"
           data-kw-name="${safeName}"
           data-kw-icon="${safeIcon}"
           data-kw-desc="${cleanDesc}"
           data-kw-stack="${slot.stack || 1}"
           data-kw-duration="${isPermanent ? '영구 지속' : `${slot.duration || 1}턴`}"
           data-kw-immortal="${slot.isImmortal ? '불멸' : '일반'}"
           data-kw-type="${isDebuff ? '디버프' : '버프'}"
           data-kw-color="${accentColor}"
           data-kw-synergy-group="${slotGroup || ''}"
           data-kw-synergy-total="${groupTotal}">
        <span class="slot-stack" style="color: ${accentColor}; font-size:0.72rem; font-weight:900; pointer-events:auto;">${stackText}</span>
        <span class="slot-icon"
              data-kw-name="${safeName}"
              data-kw-icon="${safeIcon}"
              data-kw-desc="${cleanDesc}"
              data-kw-stack="${slot.stack || 1}"
              data-kw-duration="${isPermanent ? '영구 지속' : `${slot.duration || 1}턴`}"
              data-kw-immortal="${slot.isImmortal ? '불멸' : '일반'}"
              data-kw-type="${isDebuff ? '디버프' : '버프'}"
              data-kw-color="${accentColor}"
              data-kw-synergy-group="${slotGroup || ''}"
              data-kw-synergy-total="${groupTotal}"
              style="pointer-events:auto; display:inline-flex; align-items:center; justify-content:center;">${iconHtml}</span>
        <span class="slot-duration" style="font-size:0.65rem; font-weight:700; pointer-events:auto;">${durationText}${starHtml}</span>
      </div>
    `;
  }).join('');

  // Breaking / Death overlay
  const deadClass = c.isDead ? 'unit-dead' : '';
  const breakingClass = c.isBreaking ? 'unit-breaking' : '';

  // Real-time Effective Combat Modifiers (Buffs, Debuffs, Red Superchat)
  const mods = extractCharacterCombatModifiers(c);
  const effectiveAtk = Math.max(0, Math.round(c.atk * (1 + (mods.atkPercent || 0) / 100)));
  const effectiveIdol = Math.max(0, Math.round(c.idolPower * (1 + (mods.idolPercent || 0) / 100)));
  const effectiveDef = Math.max(0, c.def + (mods.defDelta || 0));
  const effectiveMdef = Math.max(0, c.mdef + (mods.mdefDelta || 0));
  const effectiveAcc = Math.max(0, Math.min(100, c.accuracy + (mods.accuracyBonus || 0)));
  const effectiveEva = Math.max(0, Math.min(100, c.evasion + (mods.evasionBonus || 0)));
  const effectiveCrit = Math.max(0, Math.min(100, c.critChance + (mods.critBonus || 0)));
  const effectiveCritDmg = (c.critDmg || 1.5) + (mods.critDmgBonus || 0);
  const effectiveAggro = getEffectiveAggro(c);

  let effectiveSpeed = (c.speed || 10) + (c.redSuperchat?.speed || 0);
  if (Array.isArray(c.statusSlots)) {
    for (const s of c.statusSlots) {
      const mult = s.isPower ? (s.stack || 1) : 1;
      const rawK = s.rawKeyword || {};
      let hasSpeedTarget = false;
      for (let i = 1; i <= 5; i++) {
        if (rawK[`Keyword_Stat_Target_${i}`] === '속도') {
          hasSpeedTarget = true;
          effectiveSpeed += (Number(rawK[`Keyword_Stat_Value_${i}`]) || 0) * mult;
        }
      }
      if (!hasSpeedTarget) {
        if (s.keywordId === 'Key_007' || s.name === '압도') effectiveSpeed -= 2 * (s.stack || 1);
      }
      if (s.keywordId === 'Key_009' || s.name === '빙결') effectiveSpeed -= 3;
      if (s.keywordId === 'Key_019' || s.name === '가속') effectiveSpeed += 1 * (s.stack || 1);
    }
  }
  effectiveSpeed = Math.max(1, effectiveSpeed);
  if (c.isBreaking) effectiveSpeed = Math.floor(effectiveSpeed * 0.5);

  let totalResistance = Number(c.reg ?? c.resistance ?? 0);
  if (Array.isArray(c.statusSlots)) {
    for (const slot of c.statusSlots) {
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
  const effectiveRes = Math.max(0, Math.min(100, totalResistance));
  const baseRes = Number(c.reg ?? c.resistance ?? 0);

  const formatStatDiff = (eff, base, suffix = '') => {
    const diff = eff - base;
    if (Math.abs(diff) < 0.01) return `${eff}${suffix}`;
    const sign = diff > 0 ? '+' : '';
    const color = diff > 0 ? '#4ade80' : '#f87171';
    return `${eff}${suffix} <span style="color:${color}; font-weight:800; font-size:0.85em;">(${sign}${diff}${suffix})</span>`;
  };

  const defMitigation = Math.round((effectiveDef / (100 + effectiveDef)) * 100);
  const defDiff = effectiveDef - c.def;
  const defDiffHtml = defDiff !== 0
    ? ` <span style="color:${defDiff > 0 ? '#4ade80' : '#f87171'}; font-weight:800; font-size:0.85em;">(${defDiff > 0 ? '+' : ''}${defDiff})</span>`
    : '';

  const mdefMitigation = Math.round((effectiveMdef / (100 + effectiveMdef)) * 100);
  const mdefDiff = effectiveMdef - c.mdef;
  const mdefDiffHtml = mdefDiff !== 0
    ? ` <span style="color:${mdefDiff > 0 ? '#4ade80' : '#f87171'}; font-weight:800; font-size:0.85em;">(${mdefDiff > 0 ? '+' : ''}${mdefDiff})</span>`
    : '';

  return `
    <div id="unit-card-${c.characterId}"
         class="arena-unit-card ${deadClass} ${breakingClass}"
         data-character-id="${c.characterId}"
         data-team-id="${c.teamId}"
         style="--role-color: ${borderColor};">

      <!-- 11시 속성 오각별 앰블럼 -->
      <div class="arena-card-star-crest">
        <img src="${starIconUrl}" alt="${c.characterType}" draggable="false">
      </div>

      <!-- 1시 BP 원형 앰블럼 -->
      <div class="arena-card-bp-crest ${c.isBreaking ? 'bp-breaking' : ''}">
        ${c.isBreaking ? '⚡' : c.currentBreak}
      </div>

      <!-- Badges Row (Red Superchat & Tarot) -->
      ${badgesRowHtml}

      <!-- Character Portrait Art -->
      <div class="arena-card-portrait-wrapper">
        ${portraitUrl ? `<img class="arena-card-portrait" src="${portraitUrl}" alt="${c.name}" draggable="false">` : `<div class="arena-card-no-portrait">${c.name}</div>`}
        
        <!-- Status Effect Overlay Rows -->
        <div class="arena-card-status-overlay">
          ${statusSlotsHtml}
        </div>

        <!-- Breaking & Death Indicators -->
        ${c.isBreaking ? `
          <div class="arena-breaking-banner">
            ⚡ BREAKING! (${c.breakingTurnsRemaining}T)
          </div>
        ` : ''}
        ${c.isDead ? `
          <div class="arena-death-banner">
            ☠️ 사망
          </div>
        ` : ''}

        <!-- Manual Targeting Reticle -->
        <div class="arena-target-reticle">🎯</div>
      </div>

      <!-- BP Bar -->
      <div class="arena-bp-bar-container">
        <div class="arena-bp-fill" style="width: ${bpPct}%;"></div>
        <span class="arena-bp-text">BP ${c.currentBreak}/${c.maxBreak}</span>
      </div>

      <!-- HP & Shield Bar -->
      <div class="arena-hp-bar-container">
        <div class="arena-hp-fill" style="width: ${hpPct}%; background: ${hpColor};"></div>
        ${currentShield > 0 ? `<div class="arena-shield-fill" style="width: ${shieldPct}%;"></div>` : ''}
        <span class="arena-hp-text">${Math.max(0, c.hp)} / ${c.maxHp} ${currentShield > 0 ? `(+${currentShield})` : ''}</span>
      </div>

      <!-- Sub-panel (Aggro & Two Notch Tabs: Left for Offensive, Right for Defensive) -->
      <div class="arena-card-subpanel">
        <div class="subpanel-aggro-row">
          <span class="subpanel-aggro-label">AG</span>
          <span class="subpanel-aggro-val" style="${effectiveAggro !== c.aggro ? `color:${effectiveAggro > c.aggro ? '#f87171' : '#38bdf8'}; font-weight:900;` : ''}">${effectiveAggro}</span>
        </div>
        <div class="subpanel-notches-row">
          <div class="subpanel-notch-tab notch-tab-left" data-character-id="${c.characterId}" data-tab="offensive" title="공격적 스탯">
            <span class="notch-line"></span>
          </div>
          <button type="button" class="subpanel-notch-btn-info" data-character-id="${c.characterId}" data-action="open-info" title="캐릭터 상세 정보">ℹ️</button>
          <div class="subpanel-notch-tab notch-tab-right" data-character-id="${c.characterId}" data-tab="defensive" title="수비적 스탯">
            <span class="notch-line"></span>
          </div>
        </div>
      </div>

    </div>
  `;
}

/**
 * Describe Red Superchat Buff per Character Role
 */
function getRedSuperchatDesc(c) {
  const role = c.mainRole || '';
  if (role.includes('근거리')) return '공격력 +25%, 최대/현재 HP +15%';
  if (role.includes('원거리')) return '공격력 +25%, 명중률 +8%';
  if (role.includes('마법')) return '아이돌력 +25%, 속도 +3';
  if (role.includes('탱커')) return '최대/현재 HP +20%, 물리/마법방어 +7';
  if (role.includes('암살자')) return '공격력 +25%, 치명타율 +12%';
  if (role.includes('버퍼')) return '아이돌력 +25%, 드로우 +1장 반환';
  if (role.includes('디버퍼')) return '아이돌력 +25%, 모든 적 공격력 -8%';
  if (role.includes('힐러')) return '아이돌력 +25%, 회복량 +20%';
  return '모든 능력치 대폭 상승';
}

let activeStatPopoverCharId = null;
let activeStatPopoverTab = null;

export function closeUnitStatPopover() {
  const popover = document.getElementById('floating-unit-stat-popover');
  if (popover) {
    popover.remove();
  }
  document.querySelectorAll('.subpanel-notch-tab.active-notch').forEach(el => el.classList.remove('active-notch'));
  activeStatPopoverCharId = null;
  activeStatPopoverTab = null;
}

export function showUnitStatPopover(c, tab, anchorEl, cardEl) {
  if (activeStatPopoverCharId === c.characterId && activeStatPopoverTab === tab) {
    closeUnitStatPopover();
    return;
  }
  closeUnitStatPopover();

  activeStatPopoverCharId = c.characterId;
  activeStatPopoverTab = tab;

  if (anchorEl) anchorEl.classList.add('active-notch');

  let popover = document.getElementById('floating-unit-stat-popover');
  if (!popover) {
    popover = document.createElement('div');
    popover.id = 'floating-unit-stat-popover';
    popover.className = 'floating-unit-stat-popover';
    document.body.appendChild(popover);
  }

  const mods = extractCharacterCombatModifiers(c);
  const effectiveAtk = Math.max(0, Math.round(c.atk * (1 + (mods.atkPercent || 0) / 100)));
  const effectiveIdol = Math.max(0, Math.round(c.idolPower * (1 + (mods.idolPercent || 0) / 100)));
  const effectiveDef = Math.max(0, c.def + (mods.defDelta || 0));
  const effectiveMdef = Math.max(0, c.mdef + (mods.mdefDelta || 0));
  const effectiveAcc = Math.max(0, Math.min(100, c.accuracy + (mods.accuracyBonus || 0)));
  const effectiveEva = Math.max(0, Math.min(100, c.evasion + (mods.evasionBonus || 0)));
  const effectiveCrit = Math.max(0, Math.min(100, c.critChance + (mods.critBonus || 0)));
  const effectiveCritDmg = (c.critDmg || 1.5) + (mods.critDmgBonus || 0);
  const effectiveAggro = getEffectiveAggro(c);

  let effectiveSpeed = (c.speed || 10) + (c.redSuperchat?.speed || 0);
  if (Array.isArray(c.statusSlots)) {
    for (const s of c.statusSlots) {
      const mult = s.isPower ? (s.stack || 1) : 1;
      const rawK = s.rawKeyword || {};
      let hasSpeedTarget = false;
      for (let i = 1; i <= 5; i++) {
        if (rawK[`Keyword_Stat_Target_${i}`] === '속도') {
          hasSpeedTarget = true;
          effectiveSpeed += (Number(rawK[`Keyword_Stat_Value_${i}`]) || 0) * mult;
        }
      }
      if (!hasSpeedTarget) {
        if (s.keywordId === 'Key_007' || s.name === '압도') effectiveSpeed -= 2 * (s.stack || 1);
      }
      if (s.keywordId === 'Key_009' || s.name === '빙결') effectiveSpeed -= 3;
      if (s.keywordId === 'Key_019' || s.name === '가속') effectiveSpeed += 1 * (s.stack || 1);
    }
  }
  effectiveSpeed = Math.max(1, effectiveSpeed);
  if (c.isBreaking) effectiveSpeed = Math.floor(effectiveSpeed * 0.5);

  let totalResistance = Number(c.reg ?? c.resistance ?? 0);
  if (Array.isArray(c.statusSlots)) {
    for (const slot of c.statusSlots) {
      const raw = slot.rawKeyword || {};
      const mult = slot.isPower ? (slot.stack || 1) : 1;
      for (let i = 1; i <= 5; i++) {
        const targetType = raw[`Keyword_Stat_Target_${i}`];
        const rawVal = raw[`Keyword_Stat_Value_${i}`];
        if ((targetType === '저항력%' || targetType === '저항력') && rawVal !== undefined && rawVal !== '') {
          const num = Number(rawVal);
          if (!isNaN(num)) totalResistance += num * mult;
        }
      }
    }
  }
  const effectiveRes = Math.max(0, Math.min(100, totalResistance));
  const baseRes = Number(c.reg ?? c.resistance ?? 0);

  const formatStatDiff = (eff, base, suffix = '') => {
    const diff = eff - base;
    if (Math.abs(diff) < 0.01) return `${eff}${suffix}`;
    const sign = diff > 0 ? '+' : '';
    const color = diff > 0 ? '#4ade80' : '#f87171';
    return `${eff}${suffix} <span style="color:${color}; font-weight:800; font-size:0.85em;">(${sign}${diff}${suffix})</span>`;
  };

  const defMitigation = Math.round((effectiveDef / (100 + effectiveDef)) * 100);
  const defDiff = effectiveDef - c.def;
  const defDiffHtml = defDiff !== 0
    ? ` <span style="color:${defDiff > 0 ? '#4ade80' : '#f87171'}; font-weight:800; font-size:0.85em;">(${defDiff > 0 ? '+' : ''}${defDiff})</span>`
    : '';

  const mdefMitigation = Math.round((effectiveMdef / (100 + effectiveMdef)) * 100);
  const mdefDiff = effectiveMdef - c.mdef;
  const mdefDiffHtml = mdefDiff !== 0
    ? ` <span style="color:${mdefDiff > 0 ? '#4ade80' : '#f87171'}; font-weight:800; font-size:0.85em;">(${mdefDiff > 0 ? '+' : ''}${mdefDiff})</span>`
    : '';

  const currentShield = c.shield || 0;

  const offensiveStatsHtml = `
    <div class="popover-stat-row"><span class="popover-stat-name">공격력</span><span class="popover-stat-val font-atk">${formatStatDiff(effectiveAtk, c.atk)}</span></div>
    <div class="popover-stat-row"><span class="popover-stat-name">아이돌력</span><span class="popover-stat-val font-pow">${formatStatDiff(effectiveIdol, c.idolPower)}</span></div>
    <div class="popover-stat-row"><span class="popover-stat-name">치명타</span><span class="popover-stat-val font-crit">${formatStatDiff(effectiveCrit, c.critChance, '%')}</span></div>
    <div class="popover-stat-row"><span class="popover-stat-name">치명타피해량</span><span class="popover-stat-val font-crit-dmg">${formatStatDiff(Math.round(effectiveCritDmg * 100), Math.round((c.critDmg || 1.5) * 100), '%')}</span></div>
    <div class="popover-stat-row"><span class="popover-stat-name">명중률</span><span class="popover-stat-val font-acc">${formatStatDiff(effectiveAcc, c.accuracy, '%')}</span></div>
    <div class="popover-stat-row"><span class="popover-stat-name">속도</span><span class="popover-stat-val font-speed">${formatStatDiff(effectiveSpeed, c.speed)}</span></div>
  `;

  const defensiveStatsHtml = `
    <div class="popover-stat-row"><span class="popover-stat-name">체력</span><span class="popover-stat-val font-hp">${Math.max(0, c.hp)} / ${c.maxHp}</span></div>
    <div class="popover-stat-row"><span class="popover-stat-name">보호막</span><span class="popover-stat-val font-shield">${currentShield > 0 ? `+${currentShield}` : '0'}</span></div>
    <div class="popover-stat-row"><span class="popover-stat-name">어그로</span><span class="popover-stat-val font-aggro">${formatStatDiff(effectiveAggro, c.aggro)}</span></div>
    <div class="popover-stat-row"><span class="popover-stat-name">브레이크</span><span class="popover-stat-val font-bp">${c.currentBreak} / ${c.maxBreak}</span></div>
    <div class="popover-stat-row"><span class="popover-stat-name">물리방어</span><span class="popover-stat-val font-pdef">${effectiveDef} <span class="stat-mitigation">(-${defMitigation}%)</span>${defDiffHtml}</span></div>
    <div class="popover-stat-row"><span class="popover-stat-name">마법방어</span><span class="popover-stat-val font-mdef">${effectiveMdef} <span class="stat-mitigation">(-${mdefMitigation}%)</span>${mdefDiffHtml}</span></div>
    <div class="popover-stat-row"><span class="popover-stat-name">회피</span><span class="popover-stat-val font-eva">${formatStatDiff(effectiveEva, c.evasion, '%')}</span></div>
    <div class="popover-stat-row"><span class="popover-stat-name">저항력</span><span class="popover-stat-val font-res">${formatStatDiff(effectiveRes, baseRes, '%')}</span></div>
  `;

  popover.innerHTML = `
    <div class="popover-header">
      <div style="display:flex; align-items:center; gap:6px;">
        <span style="font-weight:bold; color:#f8fafc;">${c.name}</span>
        <span style="font-size:0.7rem; color:#94a3b8;">${c.characterType}</span>
      </div>
      <button type="button" id="popover-close-btn" style="background:none; border:none; color:#94a3b8; font-size:12px; cursor:pointer; padding:0 3px;">✕</button>
    </div>
    <div style="display:flex; gap:4px; margin-bottom:8px;">
      <button type="button" id="popover-tab-atk" style="flex:1; padding:3px 0; font-size:0.72rem; font-weight:700; border-radius:4px; border:1px solid ${tab === 'offensive' ? '#f87171' : 'rgba(255,255,255,0.1)'}; background:${tab === 'offensive' ? 'rgba(239,68,68,0.25)' : 'rgba(255,255,255,0.05)'}; color:${tab === 'offensive' ? '#fca5a5' : '#94a3b8'}; cursor:pointer;">⚔️ 공격</button>
      <button type="button" id="popover-tab-def" style="flex:1; padding:3px 0; font-size:0.72rem; font-weight:700; border-radius:4px; border:1px solid ${tab === 'defensive' ? '#38bdf8' : 'rgba(255,255,255,0.1)'}; background:${tab === 'defensive' ? 'rgba(56,189,248,0.25)' : 'rgba(255,255,255,0.05)'}; color:${tab === 'defensive' ? '#7dd3fc' : '#94a3b8'}; cursor:pointer;">🛡️ 수비</button>
    </div>
    <div class="popover-stats-body">
      ${tab === 'offensive' ? offensiveStatsHtml : defensiveStatsHtml}
    </div>
  `;

  popover.querySelector('#popover-close-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeUnitStatPopover();
  });

  popover.querySelector('#popover-tab-atk')?.addEventListener('click', (e) => {
    e.stopPropagation();
    showUnitStatPopover(c, 'offensive', anchorEl, cardEl);
  });

  popover.querySelector('#popover-tab-def')?.addEventListener('click', (e) => {
    e.stopPropagation();
    showUnitStatPopover(c, 'defensive', anchorEl, cardEl);
  });

  const targetRect = (anchorEl || cardEl).getBoundingClientRect();
  const popoverWidth = 220;
  const popoverHeight = 240;

  let left = Math.min(Math.max(8, targetRect.left + (targetRect.width / 2) - (popoverWidth / 2)), window.innerWidth - popoverWidth - 10);

  // Player 2 (TEAM_B, bottom team) MUST open UPWARD. Also open upward if space below is limited.
  const isPlayer2 = (c.teamId === 'TEAM_B');
  let top;
  if (isPlayer2 || (targetRect.bottom + popoverHeight > window.innerHeight - 8)) {
    top = Math.max(8, targetRect.top - popoverHeight - 6);
  } else {
    top = targetRect.bottom + 6;
  }

  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;
  popover.style.display = 'block';
}

if (!window._statPopoverGlobalInited) {
  window._statPopoverGlobalInited = true;
  document.addEventListener('click', (e) => {
    const popover = document.getElementById('floating-unit-stat-popover');
    if (!popover) return;
    if (e.target.closest('#floating-unit-stat-popover') || e.target.closest('.subpanel-notch-tab')) {
      return;
    }
    closeUnitStatPopover();
  });
}

/**
 * Attach Card Click Interactions (Targeting & [ ㅡ - ㅡ ] Notches)
 */
function attachUnitCardInteractions() {
  const cards = document.querySelectorAll('.arena-unit-card');
  cards.forEach(cardEl => {
    const charId = cardEl.getAttribute('data-character-id');
    const teamId = cardEl.getAttribute('data-team-id');
    const targetChar = (teamId === 'TEAM_A')
      ? activeArenaEngine?.state?.teamA?.characters?.find(c => c.characterId === charId)
      : activeArenaEngine?.state?.teamB?.characters?.find(c => c.characterId === charId) || activeArenaEngine?.getCharacterById(charId);
    if (!targetChar) return;

    // Card Body Click: STRICTLY for targeting during isManualTargeting.
    // Outside targeting: DO NOT open modal. (Battle 3 & 10)
    cardEl.addEventListener('click', () => {
      if (isManualTargeting && selectedHandCard) {
        if (targetChar.isDead) return;

        const skillData = selectedHandCard.skillData || selectedHandCard.rawSkill || {};
        const desc = String(skillData.Skill_Desc || '');
        const targetStr = String(skillData.Act1_Target || skillData.Skill_Target || '').trim();
        const isFlexibleBranch = desc.includes('대상에 따라') || String(skillData.Cond_Trigger || '').includes('BRANCH_BY_TARGET_TEAM');
        const hasManualAlly = desc.includes('지정한 아군') || desc.includes('아군 타깃') || targetStr === '아군' || targetStr === '자신' || targetStr === '무작위_아군';
        const hasManualEnemy = desc.includes('지정한 적') || desc.includes('적 타깃') || targetStr === '적' || targetStr === '무작위_적';
        const isAllyTarget = (selectedHandCard.cardType === CardType.MEMORIAL) || targetStr.includes('아군') || targetStr.includes('자신') || targetStr === 'ALLY' || targetStr === 'SELF';

        let isTargetValid = false;
        if (isFlexibleBranch) {
          isTargetValid = true;
        } else if (hasManualAlly) {
          isTargetValid = (teamId === 'TEAM_A');
        } else if (hasManualEnemy) {
          isTargetValid = (teamId === 'TEAM_B');
        } else {
          isTargetValid = isAllyTarget ? (teamId === 'TEAM_A') : (teamId === 'TEAM_B');
        }

        if (isTargetValid) {
          executeSelectedCard(selectedHandCard, targetChar.characterId);
        }
      }
    });

    // Center Info Button: Opens Character Info Modal
    const infoBtn = cardEl.querySelector('.subpanel-notch-btn-info');
    if (infoBtn) {
      infoBtn.addEventListener('click', (e) => {
        if (isManualTargeting && selectedHandCard) {
          return; // Let bubble to card for targeting
        }
        e.stopPropagation();
        closeUnitStatPopover();
        openBattleCharInfoModal(targetChar);
      });
    }

    // Left Notch: Offensive stats popover
    const notchLeft = cardEl.querySelector('.notch-tab-left');
    if (notchLeft) {
      notchLeft.addEventListener('click', (e) => {
        if (isManualTargeting && selectedHandCard) {
          return; // Let bubble to card for targeting
        }
        e.stopPropagation();
        showUnitStatPopover(targetChar, 'offensive', notchLeft, cardEl);
      });
    }

    // Right Notch: Defensive stats popover
    const notchRight = cardEl.querySelector('.notch-tab-right');
    if (notchRight) {
      notchRight.addEventListener('click', (e) => {
        if (isManualTargeting && selectedHandCard) {
          return; // Let bubble to card for targeting
        }
        e.stopPropagation();
        showUnitStatPopover(targetChar, 'defensive', notchRight, cardEl);
      });
    }
  });
}

/**
 * Open Card Selection Modal when Player's turn arrives
 */
function openCardSelectionModal(handCards = null, isQuickExtraTurn = false) {
  if (!activeArenaEngine) return;
  const s = activeArenaEngine.state;

  const hand = handCards || s.teamA.hand || [];
  const modal = document.getElementById('arena-card-modal');
  const cardsContainer = document.getElementById('arena-card-list');
  if (!modal || !cardsContainer) return;

  if (hand.length === 0) {
    // If hand is empty, advance automatically
    activeArenaEngine.executeForcedTurnEnd(activeArenaEngine.teamA);
    return;
  }

  // Check if any drawn card is playable
  const usableCards = hand.filter(card => {
    const isMemorial = (card.cardType === CardType.MEMORIAL || card.skillId === 'B_S_001');
    const isTired = (card.cardType === CardType.CURSE || card.skillId === 'B_S_014');
    const isCurseOrMemorial = isMemorial || isTired;
    if (isCurseOrMemorial) {
      const livingAllies = activeArenaEngine.state.teamA.characters.filter(c => !c.isDead && c.hp > 0);
      return livingAllies.length > 0;
    }
    const owner = activeArenaEngine.getCharacterById(card.ownerCharacterId);
    return !card.isBlockedByBreaking && owner && !owner.isDead && !owner.isBreaking;
  });
  const hasPlayableCards = usableCards.length > 0;

  // Toggle quick extra turn visual aura on modal content
  const modalContent = modal.querySelector('.arena-card-modal-content');
  if (modalContent) {
    if (isQuickExtraTurn) {
      modalContent.classList.add('quick-extra-turn-active');
    } else {
      modalContent.classList.remove('quick-extra-turn-active');
    }
  }

  // Render notice or quick extra turn banner
  const noticeArea = document.getElementById('arena-card-notice-area');
  if (noticeArea) {
    if (!hasPlayableCards) {
      noticeArea.innerHTML = `
        <div class="arena-no-cards-notice">
          ⚠️ 현재 모든 출전 멤버가 브레이킹 또는 행동 불가 상태여서 사용할 수 있는 카드가 없습니다.
        </div>
      `;
    } else if (isQuickExtraTurn) {
      noticeArea.innerHTML = `
        <div class="arena-quick-turn-banner">
          <span class="quick-icon-pulse">⚡</span>
          <div class="quick-text-box">
            <span class="quick-title">⚡ 속공 연계 추가 턴 발동! ⚡</span>
            <span class="quick-sub">속공 카드의 신속한 연계 효과로 즉시 다음 카드를 사용할 수 있습니다!</span>
          </div>
          <span class="quick-icon-pulse">⚡</span>
        </div>
      `;
    } else {
      noticeArea.innerHTML = '';
    }
  }

  modal.classList.add('active');

  cardsContainer.innerHTML = hand.map((card, idx) => {
    const isMemorial = (card.cardType === CardType.MEMORIAL || card.skillId === 'B_S_001');
    const isTired = (card.cardType === CardType.CURSE || card.skillId === 'B_S_014');
    const isCurseOrMemorial = isMemorial || isTired;
    const owner = activeArenaEngine.getCharacterById(card.ownerCharacterId);
    const hasInaction = owner && Array.isArray(owner.statusSlots) && owner.statusSlots.some(s => {
      const clean = String(s.keywordId || '').replace(/^[tsaeTSAE]_/, '').trim();
      return clean === 'Key_006' || s.name === '행동불가';
    });
    const isUsable = isCurseOrMemorial
      ? (activeArenaEngine.state.teamA.characters.some(c => !c.isDead && c.hp > 0))
      : (!card.isBlockedByBreaking && owner && !owner.isDead && !owner.isBreaking && !hasInaction);
    const rawOwner = owner?.raw || {};
    const portraitLong = rawOwner.Character_Image_Long || rawOwner.Character_Image_Full || rawOwner.Character_Image || rawOwner.Character_Portrait || '';

    const skillData = card.skillData || card.rawSkill || {};
    const skillName = card.skillName || skillData.Skill_Name || card.skillId || '스킬';
    const overheat = card.overheatCost !== undefined ? card.overheatCost : getCardOverheat(card, owner);

    // Overheat text & color (OH +n, OH -n, OH 0 without emojis)
    let ohBadge = `OH +${overheat}`;
    let ohClass = 'oh-cost-hot';
    let ohColor = '#ef4444';
    if (overheat < 0) {
      ohBadge = `OH -${Math.abs(overheat)}`;
      ohClass = 'oh-cost-cool';
      ohColor = '#38bdf8';
    } else if (overheat === 0) {
      ohBadge = 'OH 0';
      ohClass = 'oh-cost-zero';
      ohColor = '#64748b';
    }

    // Skill Category Badge & Quick Card Badge
    const catInfo = getSkillCategoryBadge(skillData, card);

    // Card Tier & Border Styling (Tier Color -> Art -> Skill Info)
    let tierColor = '#3b82f6';
    let typeName = '기본기';
    let typeGradient = 'linear-gradient(135deg, #1e3a8a, #3b82f6)';
    if (card.cardType === CardType.ULTIMATE) {
      tierColor = '#f59e0b';
      typeName = '궁극기';
      typeGradient = 'linear-gradient(135deg, #78350f, #f59e0b)';
    } else if (card.cardType === CardType.UNIQUE) {
      tierColor = '#a855f7';
      typeName = '고유기';
      typeGradient = 'linear-gradient(135deg, #4c1d95, #8b5cf6)';
    } else if (card.cardType === CardType.MEMORIAL) {
      tierColor = '#ef4444';
      typeName = '추모 카드';
      typeGradient = 'linear-gradient(135deg, #18181b, #7f1d1d)';
    } else if (isTired) {
      tierColor = '#a855f7';
      typeName = '저주 카드';
      typeGradient = 'linear-gradient(135deg, #18181b, #581c87)';
    }

    const ownerAttr = owner?.characterType || rawOwner.Character_Type || '청초';
    const ownerAttrIcon = isCurseOrMemorial ? '' : (ATTR_ICONS[ownerAttr] || '');

    // Grid Scope visualization
    const scopeHtml = renderGridScopeHtml(card);

    const skillDescStr = String(skillData.Skill_Desc || '');
    const isCompoundOrBranching = (skillDescStr.includes('아군') && skillDescStr.includes('적')) || skillDescStr.includes('대상에 따라') || skillDescStr.includes('지정한');
    const isCardAuto = (card.targetMethod === 'AUTO' || card.targetMode === 'AUTO') && !isCompoundOrBranching;

    const rawOff = skillData.Skill_Offensive;
    const isOffensive = (rawOff === 'Offensive' || rawOff === 'true' || rawOff === true || card.isOffensive);

    return `
      <div class="arena-hand-card ${!isUsable ? 'card-disabled' : ''}" data-hand-index="${idx}" data-offensive="${isOffensive ? 'true' : 'false'}" style="--tier-color: ${tierColor};">
        <!-- 1. Illustration at the TOP with floating Tier Badge (top-left) -->
        <div class="hand-card-art-frame">
          <div class="hand-card-tier-badge" style="background: ${typeGradient};">${typeName}</div>
          ${portraitLong ? `
            <img class="hand-card-art-img" src="${portraitLong}" alt="${owner ? owner.name : ''}">
          ` : `
            <div class="hand-card-art-placeholder">${owner ? owner.name : (isMemorial ? '추모' : (isTired ? '지쳐감' : '홀로멤'))}</div>
          `}
          <div class="hand-card-owner-tag">
            ${ownerAttrIcon ? `<img src="${ownerAttrIcon}" class="hand-card-attr-icon" alt="${ownerAttr}">` : ''}
            <div class="owner-text-wrap">
              <span class="owner-name">${owner ? owner.name : (isMemorial ? '전체 아군' : (isTired ? '피로 / 지쳐감' : '홀로멤'))}</span>
              <span class="owner-role">${owner ? owner.mainRole : (isMemorial ? '추모' : (isTired ? '저주' : ''))}</span>
            </div>
          </div>
        </div>

        <!-- 2. Skill Information ALL grouped together below the illustration -->
        <div class="hand-card-body">
          <div class="hand-card-meta-bar">
            <span class="hand-card-cat-badge" style="background: ${catInfo.color};">${catInfo.label}</span>
            ${catInfo.isQuick ? `<span class="hand-card-quick-badge">⚡ 속공</span>` : ''}
          </div>

          <div class="hand-skill-header-row">
            <div class="hand-skill-name">${skillName}</div>
            <span class="hand-card-oh-pill ${ohClass}">${ohBadge}</span>
          </div>
          
          <div class="hand-card-scope-box">
            ${scopeHtml}
          </div>

          <div class="hand-skill-desc">
            ${getSkillDescription(skillData, card)}
          </div>
        </div>

        ${!isUsable ? `
          <div class="hand-card-disabled-overlay">
            ⚠️ 사용 불가 (${hasInaction ? '행동 불가' : (owner && owner.isBreaking ? '브레이킹' : (isCurseOrMemorial ? '생존 아군 없음' : '사망'))})
          </div>
        ` : ''}

        <button class="hand-card-select-btn ${isCardAuto ? 'btn-auto-use' : 'btn-manual-target'}" ${!isUsable ? 'disabled' : ''}>
          ${isCardAuto ? '⚡ 즉시 사용' : '🎯 대상 선택'}
        </button>
      </div>
    `;
  }).join('');

  // Pass Turn button handling in footer
  const passWrapper = document.getElementById('arena-card-footer-pass-wrapper');
  if (passWrapper) {
    if (!hasPlayableCards) {
      passWrapper.innerHTML = `
        <button id="btn-arena-pass-turn" class="arena-pass-turn-btn" type="button">
          ⏭️ 턴 넘기기
        </button>
      `;
      const btnPass = document.getElementById('btn-arena-pass-turn');
      if (btnPass) {
        btnPass.addEventListener('click', () => {
          closeCardModal();
          activeArenaEngine.executeForcedTurnEnd(activeArenaEngine.teamA);
        });
      }
    } else {
      passWrapper.innerHTML = '';
    }
  }

  // 12 o'clock type advantage hint bar on hover
  const typeHintBar = document.getElementById('arena-card-selection-type-hint');
  if (typeHintBar) {
    typeHintBar.style.display = 'none';
    typeHintBar.innerHTML = '';
  }

  // Attach card selection clicks & hover listeners
  const cardEls = cardsContainer.querySelectorAll('.arena-hand-card');
  cardEls.forEach(cardEl => {
    cardEl.addEventListener('mouseenter', () => {
      const isOff = cardEl.getAttribute('data-offensive') === 'true';
      if (!isOff || !typeHintBar) {
        if (typeHintBar) typeHintBar.style.display = 'none';
        return;
      }
      const idx = parseInt(cardEl.getAttribute('data-hand-index'), 10);
      const card = hand[idx];
      if (!card) return;
      const owner = activeArenaEngine?.getCharacterById(card.ownerCharacterId);
      if (!owner) return;

      const ownerAttr = owner.characterType || owner.raw?.Character_Type || '청초';
      const TYPE_ADVANTAGE_MAP = {
        '청초': ['게닌'],
        '게닌': ['쿨'],
        '쿨': ['아티스트'],
        '아티스트': ['큐트'],
        '큐트': ['청초'],
        '광기': ['에로'],
        '에로': ['광기']
      };
      const ATTR_COLORS = {
        '청초': '#38bdf8',
        '쿨': '#3b82f6',
        '게닌': '#eab308',
        '아티스트': '#a855f7',
        '큐트': '#ec4899',
        '광기': '#ef4444',
        '에로': '#f43f5e'
      };
      const targets = TYPE_ADVANTAGE_MAP[ownerAttr] || [];
      const targetStr = targets.join(', ');
      const ownerIco = ATTR_ICONS[ownerAttr] || '';
      const targetIco = ATTR_ICONS[targets[0]] || '';

      typeHintBar.innerHTML = `
        <div class="type-hint-banner">
          <span class="type-hint-title">⚡ 공격 상성 안내</span>
          <span class="type-hint-owner"><b>${owner.name}</b></span>
          <span class="type-hint-pill" style="border-color:${ATTR_COLORS[ownerAttr] || '#38bdf8'}; color:${ATTR_COLORS[ownerAttr] || '#38bdf8'};">
            ${ownerIco ? `<img src="${ownerIco}" class="type-hint-ico" alt="${ownerAttr}">` : ''}${ownerAttr}
          </span>
          <span class="type-hint-arrow">▶ 우위 ▶</span>
          <span class="type-hint-pill" style="border-color:${ATTR_COLORS[targets[0]] || '#f43f5e'}; color:${ATTR_COLORS[targets[0]] || '#f43f5e'};">
            ${targetIco ? `<img src="${targetIco}" class="type-hint-ico" alt="${targetStr}">` : ''}${targetStr}
          </span>
          <span class="type-hint-sub">(상성 피해 1.5배 & 브레이크 1 감소)</span>
        </div>
      `;
      typeHintBar.style.display = 'flex';
    });

    cardEl.addEventListener('mouseleave', () => {
      if (typeHintBar) {
        typeHintBar.style.display = 'none';
      }
    });

    cardEl.addEventListener('click', (e) => {
      if (typeHintBar) typeHintBar.style.display = 'none';
      const idx = parseInt(cardEl.getAttribute('data-hand-index'), 10);
      const card = hand[idx];
      if (!card) return;

      const isCurseOrMemorial = (card.cardType === CardType.MEMORIAL || card.cardType === CardType.CURSE || card.skillId === 'B_S_001' || card.skillId === 'B_S_014');
      if (isCurseOrMemorial) {
        const hasLivingAlly = activeArenaEngine.state.teamA.characters.some(c => !c.isDead && c.hp > 0);
        if (!hasLivingAlly) return;
      } else {
        const owner = activeArenaEngine.getCharacterById(card.ownerCharacterId);
        const hasInaction = owner && Array.isArray(owner.statusSlots) && owner.statusSlots.some(s => {
          const clean = String(s.keywordId || '').replace(/^[tsaeTSAE]_/, '').trim();
          return clean === 'Key_006' || s.name === '행동불가';
        });
        if (!owner || owner.isDead || owner.isBreaking || card.isBlockedByBreaking || hasInaction) {
          return;
        }
      }

      onCardClicked(card);
    });
  });
}

/**
 * Master Keyword lookup helper (GameData, ArenaEngine master map, CORE_KEYWORDS)
 */
export function getKeywordInfo(idOrName) {
  if (!idOrName) return null;
  const clean = String(idOrName).replace(/^[tsaeTSAE]_/, '').trim();
  const cleanNoSpace = clean.replace(/\s+/g, '');

  if (window.GameData && Array.isArray(window.GameData.keyword)) {
    const found = window.GameData.keyword.find(k =>
      k.Keyword_ID === clean ||
      k.Keyword_Name === clean ||
      (k.Keyword_Name && k.Keyword_Name.replace(/\s+/g, '') === cleanNoSpace) ||
      k.Keyword_ID === idOrName ||
      k.Keyword_Name === idOrName
    );
    if (found) return found;
  }

  if (activeArenaEngine?.keywordsMasterMap?.[clean]) {
    return activeArenaEngine.keywordsMasterMap[clean];
  }

  if (CORE_KEYWORDS[clean]) {
    return CORE_KEYWORDS[clean];
  }

  const byName = Object.values(CORE_KEYWORDS).find(k =>
    k.Keyword_Name === clean ||
    (k.Keyword_Name && k.Keyword_Name.replace(/\s+/g, '') === cleanNoSpace) ||
    k.Keyword_Name === idOrName
  );
  if (byName) return byName;

  return null;
}

/**
 * Categorize skill for badge display (Attack, Heal, Buff, Debuff, Shield, Quick)
 */
function getSkillCategoryBadge(skillData, card) {
  const tags = card.tags || (typeof skillData.Skill_Tags === 'string' ? skillData.Skill_Tags.split(',').map(s => s.trim()).filter(Boolean) : []);
  const isQuick = Boolean(card.isQuick || tags.includes('속공'));
  const rawOff = skillData.Skill_Offensive;
  const isOffensive = (rawOff === 'Offensive' || rawOff === 'true' || rawOff === true || card.isOffensive);
  const calcBase = skillData.Skill_Calc_Base || '';
  const desc = String(skillData.Skill_Desc || '');
  const name = String(skillData.Skill_Name || card.skillName || '');

  // Detect keyword and icon
  const rawKwId = skillData.Skill_Effect_1_ID || skillData.Skill_Effect_2_ID || skillData.Skill_Effect_3_ID || skillData.Skill_Keyword_ID || card.keywordId;
  const kwId = rawKwId ? String(rawKwId).replace(/^[tsaeTSAE]_/, '') : null;
  let kw = kwId ? getKeywordInfo(kwId) : null;
  if (!kw && window.GameData && Array.isArray(window.GameData.keyword)) {
    const textToSearch = `${tags.join(' ')} ${desc} ${name}`;
    kw = window.GameData.keyword.find(k => k.Keyword_Name && textToSearch.includes(k.Keyword_Name));
  }
  if (!kw) {
    const textToSearch = `${tags.join(' ')} ${desc} ${name}`;
    const coreKey = Object.values(CORE_KEYWORDS).find(k => k.Keyword_Name && textToSearch.includes(k.Keyword_Name));
    if (coreKey) kw = coreKey;
  }

  const kwIcon = kw?.Keyword_Icon || kw?.icon || '';

  let label = '기타';
  let color = '#64748b';

  if (card.cardType === CardType.MEMORIAL || name.includes('추모')) {
    label = '💧 추모';
    color = '#475569';
  } else if (desc.includes('보호막') || name.includes('보호막') || tags.includes('보호막')) {
    label = '🔘 보호막';
    color = '#0284c7';
  } else if (tags.includes('회복') || desc.includes('회복') || name.includes('회복') || name.includes('치유')) {
    label = '💚 회복';
    color = '#16a34a';
  } else if (isOffensive) {
    if (calcBase === '아이돌력' || calcBase === 'MAGIC' || desc.includes('마법피해')) {
      label = '🔮 마법 공격';
      color = '#9333ea';
    } else {
      label = '⚔️ 물리 공격';
      color = '#dc2626';
    }
  } else if (tags.includes('저주') || desc.includes('디버프') || (kw && (kw.Keyword_Type === '디버프' || kw.type === 'DEBUFF'))) {
    const icon = kwIcon || '🔻';
    label = `${icon} 디버프`;
    color = '#ea580c';
  } else {
    const icon = kwIcon || '✨';
    label = `${icon} 버프`;
    color = '#0284c7';
  }

  return { label, color, isQuick };
}

/**
 * Handle card click in hand modal
 */
function onCardClicked(card) {
  closeCardModal();

  const skillData = card.skillData || card.rawSkill || {};
  const desc = String(skillData.Skill_Desc || '');
  const isCompoundOrBranching = (desc.includes('아군') && desc.includes('적')) || desc.includes('대상에 따라') || desc.includes('지정한');
  const isAuto = (card.targetMethod === 'AUTO' || card.targetMode === 'AUTO') && !isCompoundOrBranching;

  if (isAuto) {
    // Immediate auto execution
    executeSelectedCard(card, null);
  } else {
    // Enter manual targeting mode
    enterManualTargetingMode(card);
  }
}

/**
 * Render visual 5-cell Grid Scope representation
 * Ally fixed: #facc15 (Yellow), Ally random: #84cc16 (Lime)
 * Enemy fixed: #ef4444 (Red), Enemy random: #f97316 (Orange)
 */
function renderGridScopeHtml(card) {
  const skillData = card.skillData || card.rawSkill || {};
  const desc = String(skillData.Skill_Desc || '');
  const targetRange = card.range || card.targetRange || skillData.Skill_Target_Range || skillData.Act1_Range || skillData.act1?.range || card.targetScope || 'SINGLE';
  const targetStr = String(
    card.target || 
    card.targetType || 
    skillData.Skill_Target || 
    skillData.Act1_Target || 
    (skillData.act1 && skillData.act1.target) || 
    card.rawSkill?.Act1_Target || 
    '적'
  ).trim();

  const isMemorial = (card.cardType === CardType.MEMORIAL);
  const hasManualAlly = desc.includes('지정한 아군') || desc.includes('아군 타깃') || desc.includes('아군 1명에게') || desc.includes('아군에게') || desc.includes('아군 1명 에게');
  const hasManualEnemy = desc.includes('지정한 적') || desc.includes('적 타깃') || desc.includes('적 1명에게');
  
  const isExplicitEnemy = hasManualEnemy || (targetStr === '적' && !hasManualAlly && !desc.startsWith('자신에게')) || targetStr === '적_전체' || targetStr === '무작위_적' || targetStr === 'ENEMY';
  const isSelf = !isExplicitEnemy && (targetStr === '자신' || targetStr === 'SELF' || (desc.startsWith('자신에게') && !desc.includes('적에게') && !hasManualAlly));
  const isAlly = isMemorial || hasManualAlly || targetStr.includes('아군') || targetStr === 'ALLY' || isSelf;

  const isRandom = targetRange.startsWith('RANDOM') || targetRange.includes('무작위') || 
    skillData.Skill_Target_Method === '무작위' || skillData.Act1_Target_Method === '무작위' ||
    targetStr.includes('무작위') || (typeof card.skillData?.Skill_Target_Range === 'string' && card.skillData.Skill_Target_Range.includes('무작위'));

  let themeColor = '#ef4444';
  let activeClass = 'cell-enemy-fixed';
  if (isAlly) {
    if (isRandom) {
      themeColor = '#84cc16'; // 아군 무작위: 연두색
      activeClass = 'cell-ally-random';
    } else {
      themeColor = '#facc15'; // 아군 확정 / 자신: 노란색
      activeClass = 'cell-ally-fixed';
    }
  } else {
    if (isRandom) {
      themeColor = '#f97316'; // 적군 무작위: 주황색
      activeClass = 'cell-enemy-random';
    } else {
      themeColor = '#ef4444'; // 적군 확정: 빨간색
      activeClass = 'cell-enemy-fixed';
    }
  }

  let scopeLabel = '';
  let cells = [false, false, true, false, false];

  if (isSelf) {
    scopeLabel = '자신 (단일)';
    cells = [false, false, true, false, false];
  } else {
    const targetType = isAlly ? '아군' : '적군';
    if (isRandom) {
      let count = 1;
      if (targetRange.startsWith('RANDOM_')) {
        const num = parseInt(targetRange.replace('RANDOM_', ''), 10);
        if (!isNaN(num)) count = num;
      } else if (card.targetCount) {
        count = card.targetCount;
      }
      scopeLabel = `무작위 ${targetType} ${count}인`;
      if (count === 1) cells = [false, false, true, false, false];
      else if (count === 2) cells = [false, true, false, true, false];
      else if (count === 3) cells = [false, true, true, true, false];
      else if (count === 4) cells = [true, true, true, true, false];
      else cells = [true, true, true, true, true];
    } else {
      if (targetRange === 'ALL' || targetRange === 'SPLASH_7' || targetStr.includes('전체')) {
        scopeLabel = `${targetType} 전체 (광역)`;
        cells = [true, true, true, true, true];
      } else if (targetRange === 'SPLASH_5' || targetRange === 'SPLASH_2') {
        scopeLabel = `${targetType} 중심 5칸 (광역)`;
        cells = [true, true, true, true, true];
      } else if (targetRange === 'SPLASH_3' || targetRange === 'SPLASH_1' || targetRange === 'SPLASH' || targetStr.includes('중심')) {
        scopeLabel = `${targetType} 중심 3칸 (스플래시)`;
        cells = [false, true, true, true, false];
      } else {
        scopeLabel = `${targetType} 1인 (단일)`;
        cells = [false, false, true, false, false];
      }
    }
  }

  const cellsHtml = cells.map(active => `
    <div class="grid-scope-cell ${active ? activeClass : ''}" style="${active ? `background:${themeColor}; box-shadow:0 0 6px ${themeColor};` : ''}"></div>
  `).join('');

  return `
    <div class="grid-scope-wrapper" style="border-left: 3px solid ${themeColor};">
      <div class="grid-scope-label" style="color: ${themeColor};">${scopeLabel}</div>
      <div class="grid-scope-cells">${cellsHtml}</div>
    </div>
  `;
}

const DEBUFF_KEYWORDS_SET = new Set([
  '출혈', '파괴', '매료', '원소', '중독', '행동불가', '압도', '웃음', '빙결',
  '젖음', '흑마법', 'GUESSER!!', '폭탄', '잉크', '음주', '슬픔', '수수께끼', '간파'
]);

/**
 * Applies custom color highlighting to skill descriptions:
 * - Unitized phrases for ally & enemy (아군 n명, 아군 전체, 적 n명, 적 전체)
 * - Unified purple: 아이돌력 & 마법피해
 * - Unified orange: 공격력 & 물리피해
 * - Keyword text styling without badges: cyan (buff) vs red (debuff)
 */
export function formatSkillDescriptionText(desc) {
  if (!desc) return '';
  let text = String(desc);

  // 1. Extract [ ... ] keywords into temporary placeholders with buff vs debuff text color and rich tooltip metadata
  const kwPlaceholders = [];
  text = text.replace(/\[\s*([^\]]+?)\s*\]/g, (match, p1) => {
    const idx = kwPlaceholders.length;
    const content = p1.trim();
    let isDebuff = false;
    for (const kw of DEBUFF_KEYWORDS_SET) {
      if (content.includes(kw)) {
        isDebuff = true;
        break;
      }
    }

    // Extract emoji/icon, keyword name, stack, duration
    // Matches e.g. "[ 🩸 출혈 4 / 3 ]", "[ 🛡️ 견고 6 / 4 ]", "[ 🍖 비정상 식사 1 / 4 ]", "[ 하모니 1 / 5 ]"
    let kwPart = content;
    let stack = '';
    let dur = '';
    const stackDurMatch = kwPart.match(/\s+(\d+)\s*\/\s*(\d+)\s*$/);
    if (stackDurMatch) {
      stack = stackDurMatch[1];
      dur = stackDurMatch[2];
      kwPart = kwPart.substring(0, stackDurMatch.index).trim();
    }
    const iconMatch = kwPart.match(/^([^\s가-힣A-Za-z0-9]+)\s*(.*)$/);
    let rawIcon = '';
    let kwName = kwPart;
    if (iconMatch) {
      rawIcon = iconMatch[1];
      kwName = iconMatch[2].trim();
    }

    const kwInfo = getKeywordInfo(kwName);
    const icon = rawIcon || kwInfo?.Keyword_Icon || (isDebuff ? '🔻' : '🔼');
    const kwType = kwInfo?.Keyword_Type || (isDebuff ? '디버프' : '버프');
    const kwDesc = kwInfo?.Keyword_Desc || (isDebuff ? '해당 상태이상 디버프 효과가 부여됩니다.' : '해당 이로운 버프 효과가 부여됩니다.');
    const safeDesc = String(kwDesc).replace(/"/g, '&quot;');
    const safeName = String(kwName).replace(/"/g, '&quot;');
    const safeIcon = String(icon).replace(/"/g, '&quot;');
    const color = isDebuff ? '#ef4444' : '#38bdf8';
    const cls = isDebuff ? 'desc-highlight-debuff' : 'desc-highlight-buff';

    const stackAttr = stack ? `data-kw-stack="${stack}"` : '';
    const durAttr = dur ? `data-kw-duration="${dur}턴"` : '';

    kwPlaceholders.push(`
      <span class="${cls} kw-desc-highlight"
            data-kw-name="${safeName}"
            data-kw-icon="${safeIcon}"
            data-kw-desc="${safeDesc}"
            data-kw-type="${kwType}"
            ${stackAttr}
            ${durAttr}
            data-kw-color="${color}">[ ${content} ]</span>
    `.trim());
    return `@@KW_${idx}@@`;
  });

  // 2. Unitize ally phrases (지정한 아군 n명, 무작위 아군 n명, 아군 n명, 아군 전체, 아군 타깃, 아군)
  text = text.replace(/(지정한\s*아군\s*[1-7]명|무작위\s*아군\s*[1-7]명|아군\s*[1-7]명|아군\s*전체|아군\s*타깃|아군)/g, '<span class="desc-highlight-ally">$1</span>');

  // 3. Unitize enemy phrases (지정한 적 n명, 무작위 적 n명, 모든 적, 적 n명, 적 전체, 적 타깃, 적군, 적)
  text = text.replace(/(지정한\s*적\s*[1-7]명|무작위\s*적\s*[1-7]명|모든\s*적|적\s*[1-7]명|적\s*전체|적\s*타깃|적군|(?<![가-힣])적(?![가-힣]|용|중|절|응))/g, '<span class="desc-highlight-enemy">$1</span>');

  // 4. Standalone 자신
  text = text.replace(/(자신)/g, '<span class="desc-highlight-self">$1</span>');

  // 6. Unified 공격력 & 물리피해 (Orange)
  text = text.replace(/(공격력|물리\s*피해)/g, '<span class="desc-highlight-phys">$1</span>');

  // 7. Unified 아이돌력 & 마법피해 (Purple)
  text = text.replace(/(아이돌력|마법\s*피해)/g, '<span class="desc-highlight-magic">$1</span>');

  // 8. 회복 (Green), 보호막 (Sky Blue)
  text = text.replace(/(회복)/g, '<span class="desc-highlight-heal">$1</span>');
  text = text.replace(/(보호막)/g, '<span class="desc-highlight-shield">$1</span>');

  // 9. Restore keywords
  text = text.replace(/@@KW_(\d+)@@/g, (match, idx) => {
    return kwPlaceholders[parseInt(idx, 10)] || match;
  });

  return text;
}

/**
 * Format readable skill description
 */
function getSkillDescription(s, card) {
  const rawDesc = s.Skill_Desc || card.rawSkill?.Skill_Desc || card.skillData?.Skill_Desc;
  if (rawDesc && String(rawDesc).trim()) {
    return formatSkillDescriptionText(String(rawDesc).trim());
  }

  const mult = s.Skill_Multiplier || 100;
  const isOffensive = (s.Skill_Offensive === 'Offensive' || s.Skill_Offensive === 'true' || s.Skill_Offensive === true);
  const breakDmg = s.Skill_Break || 0;

  let desc = isOffensive ? `적 1명에게 공격력의 <b>${mult}%</b> 물리 피해` : `아군 1명에게 아이돌력의 <b>${mult}%</b> 회복`;
  if (breakDmg > 0) desc += ` (Break -${breakDmg})`;

  if (s.Skill_Effect_1_ID) {
    const cleanKwId = String(s.Skill_Effect_1_ID).replace(/^[tsaeTSAE]_/, '');
    const kwObj = CORE_KEYWORDS[cleanKwId] || activeArenaEngine?.keywordsMasterMap?.[cleanKwId];
    const kwName = kwObj?.Keyword_Name || cleanKwId;
    desc += `<br>효과: [${kwName}] ${s.Skill_Effect_1_Val1 || 1}스택 (${s.Skill_Effect_1_Val2 || 2}턴)`;
  }

  if (card.cardType === CardType.MEMORIAL) {
    desc = `동료의 숭고한 희생을 기리며 오버히트 <b>-100</b> 감소!`;
  }

  return formatSkillDescriptionText(desc);
}

/**
 * Enter Manual Targeting Mode on the battlefield
 */
function enterManualTargetingMode(card) {
  isManualTargeting = true;
  selectedHandCard = card;

  const skillData = card.skillData || card.rawSkill || {};
  const skillName = card.skillName || skillData.Skill_Name || '스킬';
  const desc = String(skillData.Skill_Desc || '');
  const targetStr = String(
    card.target || 
    card.targetType || 
    skillData.Skill_Target || 
    skillData.Act1_Target || 
    skillData.act1?.target || 
    card.rawSkill?.Act1_Target || 
    ''
  ).trim();
  const isFlexibleBranch = desc.includes('대상에 따라');
  const hasManualAlly = desc.includes('지정한 아군') || desc.includes('아군 타깃') || desc.includes('아군 1명에게') || desc.includes('아군에게') || desc.includes('아군 1명 에게');
  const hasManualEnemy = desc.includes('지정한 적') || desc.includes('적 타깃') || desc.includes('적 1명에게');
  const isAlly = (card.cardType === CardType.MEMORIAL) || hasManualAlly || targetStr.includes('아군') || targetStr.includes('자신') || targetStr === 'ALLY' || targetStr === 'SELF';

  let promptTargetText = '적군 유닛';
  if (isFlexibleBranch) promptTargetText = '아군 또는 적군 유닛';
  else if (hasManualAlly) promptTargetText = '아군 유닛';
  else if (hasManualEnemy) promptTargetText = '적군 유닛';
  else promptTargetText = isAlly ? '아군 유닛' : '적군 유닛';

  const bar = document.getElementById('arena-targeting-bar');
  const barText = document.getElementById('arena-targeting-text');
  if (bar) bar.style.display = 'flex';
  if (barText) {
    barText.textContent = `🎯 [${skillName}] 대상을 선택하세요 (${promptTargetText})`;
  }

  // Highlight valid target cards
  document.querySelectorAll('.arena-unit-card').forEach(el => {
    const teamId = el.getAttribute('data-team-id');
    const isDead = el.classList.contains('unit-dead');
    if (isDead) {
      el.classList.remove('unit-targetable');
      return;
    }
    let isValid = false;
    if (isFlexibleBranch) {
      isValid = true;
    } else if (hasManualAlly) {
      isValid = (teamId === 'TEAM_A');
    } else if (hasManualEnemy) {
      isValid = (teamId === 'TEAM_B');
    } else {
      isValid = isAlly ? (teamId === 'TEAM_A') : (teamId === 'TEAM_B');
    }

    if (isValid) {
      el.classList.add('unit-targetable');
    } else {
      el.classList.remove('unit-targetable');
    }
  });
}

/**
 * Cancel targeting mode
 */
function cancelTargetingMode() {
  isManualTargeting = false;
  selectedHandCard = null;

  const bar = document.getElementById('arena-targeting-bar');
  if (bar) bar.style.display = 'none';

  document.querySelectorAll('.arena-unit-card').forEach(el => {
    el.classList.remove('unit-targetable');
  });

  // Re-open card modal so player can choose another card
  openCardSelectionModal();
}

/**
 * Execute card through engine
 */
function executeSelectedCard(card, targetId) {
  isManualTargeting = false;
  selectedHandCard = null;

  const bar = document.getElementById('arena-targeting-bar');
  if (bar) bar.style.display = 'none';

  document.querySelectorAll('.arena-unit-card').forEach(el => {
    el.classList.remove('unit-targetable');
  });

  if (activeArenaEngine) {
    activeArenaEngine.executeCardPlay(activeArenaEngine.teamA, card, targetId);
    renderBattleArena();
  }
}

/**
 * Toggle Battlefield Survey mode (Hide card modal and show floating return button)
 */
function toggleBattlefieldSurvey(enableSurvey) {
  const modal = document.getElementById('arena-card-modal');
  const overlay = document.getElementById('arena-survey-overlay');
  if (enableSurvey) {
    if (modal) modal.classList.remove('active');
    if (overlay) overlay.style.display = 'block';
  } else {
    if (overlay) overlay.style.display = 'none';
    if (modal) modal.classList.add('active');
  }
}

/**
 * Close Hand Card Modal
 */
function closeCardModal() {
  const modal = document.getElementById('arena-card-modal');
  if (modal) {
    modal.classList.remove('active');
    const content = modal.querySelector('.arena-card-modal-content');
    if (content) content.classList.remove('quick-extra-turn-active');
  }
  const typeHint = document.getElementById('arena-card-selection-type-hint');
  if (typeHint) typeHint.style.display = 'none';
  const overlay = document.getElementById('arena-survey-overlay');
  if (overlay) overlay.style.display = 'none';
}

// Tracker for staggering floating numbers per character to avoid overlaps
const unitFloatSlotMap = new Map();
const STAGGER_OFFSETS = [
  { x: 0, y: -16 },    // Slot 0: Center Top
  { x: -34, y: -38 },  // Slot 1: Top-Left
  { x: 34, y: -38 },   // Slot 2: Top-Right
  { x: 0, y: 16 }      // Slot 3: Center Bottom
];

/**
 * Spawn Animated Floating Text (Damage, Heal, Break)
 */
function spawnFloatingNumber(parentEl, text, color, scale = 1.0) {
  if (!parentEl) return;

  // Re-acquire live DOM node if parentEl is detached from active document
  if (!document.body.contains(parentEl)) {
    let liveEl = null;
    if (parentEl.id) {
      liveEl = document.getElementById(parentEl.id);
    }
    const charId = parentEl.getAttribute?.('data-character-id');
    if (!liveEl && charId) {
      liveEl = document.querySelector(`.arena-unit-card[data-character-id="${charId}"]`);
    }
    if (liveEl) {
      parentEl = liveEl;
    }
  }

  const portraitEl = parentEl.querySelector('.arena-card-portrait-wrapper') || parentEl;
  let rect = portraitEl.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    rect = parentEl.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;
  }

  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  // Stagger slot per character to prevent overlapping
  const charKey = parentEl.getAttribute('data-character-id') || parentEl.id || 'GLOBAL';
  const now = Date.now();
  const prev = unitFloatSlotMap.get(charKey) || { lastTime: 0, slot: 0 };
  let slot = 0;
  if (now - prev.lastTime < 900) {
    slot = (prev.slot + 1) % STAGGER_OFFSETS.length;
  }
  unitFloatSlotMap.set(charKey, { lastTime: now, slot });

  const offset = STAGGER_OFFSETS[slot];
  const offsetX = offset.x + (Math.random() - 0.5) * 6;
  const offsetY = offset.y + (Math.random() - 0.5) * 6;

  const floatEl = document.createElement('div');
  floatEl.className = 'arena-floating-number';
  floatEl.style.left = `${centerX + offsetX}px`;
  floatEl.style.top = `${centerY + offsetY}px`;
  floatEl.style.color = color;
  floatEl.style.setProperty('--float-scale', scale);
  floatEl.innerHTML = text;

  let overlay = document.getElementById('arena-floating-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'arena-floating-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:99999;overflow:hidden;';
    document.body.appendChild(overlay);
  }
  overlay.appendChild(floatEl);

  setTimeout(() => {
    if (floatEl.parentNode) {
      floatEl.parentNode.removeChild(floatEl);
    }
  }, 1650);
}

/**
 * Banner Toast for Quick Card (속공)
 */
function showQuickToast(data) {
  // Disabled per user request (no 12 o'clock banner toast)
}

/**
 * Banner Announcement for Turn changes
 */
const battleNoticeQueue = [];
let isBattleNoticePlaying = false;

export function enqueueBattleNotice(text, bgColor = 'rgba(139, 92, 246, 0.95)', duration = 1820) {
  battleNoticeQueue.push({ text, bgColor, duration });
  if (!isBattleNoticePlaying) {
    processNextBattleNotice();
  }
}

function processNextBattleNotice() {
  if (battleNoticeQueue.length === 0) {
    isBattleNoticePlaying = false;
    return;
  }
  isBattleNoticePlaying = true;
  const item = battleNoticeQueue.shift();
  const banner = document.getElementById('arena-turn-banner');
  if (!banner) {
    isBattleNoticePlaying = false;
    return;
  }

  banner.innerHTML = item.text;
  banner.style.background = item.bgColor;
  banner.classList.add('banner-active');

  setTimeout(() => {
    banner.classList.remove('banner-active');
    setTimeout(() => {
      processNextBattleNotice();
    }, 180);
  }, item.duration);
}

/**
 * Dedicated Top Tab Announcement for Turn changes (Battle 2 & 17)
 */
function showTurnBanner(teamId, turnCount) {
  const isPlayer = (teamId === 'TEAM_A');
  const text = isPlayer ? `✨ PLAYER TURN (${turnCount}) ✨` : `⚔️ ENEMY TURN (${turnCount}) ⚔️`;
  const tab = document.getElementById('arena-top-turn-tab');
  if (tab) {
    tab.textContent = text;
    tab.className = `arena-top-turn-tab tab-active ${isPlayer ? 'tab-player' : 'tab-enemy'}`;
    if (tab._hideTimeout) clearTimeout(tab._hideTimeout);
    tab._hideTimeout = setTimeout(() => {
      tab.classList.remove('tab-active');
    }, 1800);
  }
}

let wasPausedBeforeTarot = false;

/**
 * Dedicated Mystic Tarot Card Announcement Overlay (P_S_040)
 * Does NOT close automatically; pauses battle until player clicks confirm or overlay
 */
export function showTarotAnnouncement(data) {
  let overlay = document.getElementById('arena-tarot-announcement-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'arena-tarot-announcement-overlay';
    overlay.className = 'arena-tarot-announcement-overlay';
    document.body.appendChild(overlay);
  }

  wasPausedBeforeTarot = isPaused;
  isPaused = true;
  updatePlayPauseButton();

  const tarot = data?.tarot || {};
  const icon = tarot.icon || '🔮';
  const name = tarot.name || '운명의 타로';
  const desc = tarot.desc || '신비로운 타로의 힘이 전장에 깃듭니다.';
  const isPlayerTeam = data?.team?.isPlayer || (data?.team?.teamId === 'TEAM_A');
  let teamLabel = isPlayerTeam ? '아군 전체 효과' : '적군 전체 효과';
  if (tarot.target === 'ROLE') {
    teamLabel = isPlayerTeam ? `아군 ${tarot.roleName} 전용 효과` : `적군 ${tarot.roleName} 전용 효과`;
  } else if (tarot.target === 'SELF') {
    teamLabel = '점괘 시전자 전용 부여';
  }

  overlay.innerHTML = `
    <div class="tarot-badge-sub">🔮 빅 갓 미온의 점괘 (P_S_040) · ${teamLabel}</div>
    <div class="tarot-card-name-title">${icon} ${name}</div>
    <div class="tarot-card-desc-body">${desc}</div>
    <div class="tarot-card-footer-box" style="margin-top:14px; display:flex; flex-direction:column; align-items:center; gap:6px;">
      <button class="tarot-card-confirm-btn" style="background: linear-gradient(135deg, #a855f7, #6366f1); color: #fff; border: 1px solid #c084fc; border-radius: 8px; padding: 7px 22px; font-weight: 800; font-size: 0.88rem; cursor: pointer; box-shadow: 0 4px 14px rgba(168, 85, 247, 0.45); transition: transform 0.15s, box-shadow 0.15s;">🔮 점괘 확인 (전장 복귀)</button>
      <div class="tarot-card-footer-hint" style="font-size:0.68rem; color:rgba(255,255,255,0.65);">※ 확인 후에도 캐릭터 카드 상단 🔮 아이콘에 마우스를 올리면 효과를 언제든 확인할 수 있습니다.</div>
    </div>
  `;

  const closeTarot = () => {
    overlay.classList.remove('tarot-active');
    isPaused = wasPausedBeforeTarot;
    updatePlayPauseButton();
    renderBattleArena();
  };

  overlay.onclick = () => {
    closeTarot();
  };

  overlay.classList.add('tarot-active');
}

/**
 * Banner Announcement for Special Keywords (Tarot, Dice, SlotMachine, Moon, Riddle)
 * Duration scaled by 1.3x per user request (base 1800ms * 1.3 = 2340ms)
 */
function showSpecialNoticeBanner(text, bgColor = 'rgba(139, 92, 246, 0.95)', duration = 1800) {
  const scaledDuration = Math.round(duration * 1.3);
  enqueueBattleNotice(text, bgColor, scaledDuration);
}

/**
 * Banner Toast for Red Superchat Awakening
 */
function showRedSuperchatToast(data) {
  const toast = document.createElement('div');
  toast.className = 'arena-rsc-toast';
  toast.innerHTML = `
    <span style="font-size:1.4rem;">🧧</span>
    <span><b>${data.targetName}</b> 아카스파 각성! (+${data.statDesc || '버프 발동'})</span>
  `;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-show');
  }, 50);

  setTimeout(() => {
    toast.classList.remove('toast-show');
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 400);
  }, 2500);
}

/**
 * Banner Toast for Skill Execution
 */
function showSkillToast(data) {
  // Disabled per user request (no 12 o'clock banner toast)
}

// Cutscene transparent processed image cache
const cutsceneImageCache = new Map();

/**
 * Process image on canvas to cleanly remove solid/light background:
 * - Samples 4 directions + corners to find the closest color to pure white
 * - Avoids removing characters with white hair/clothing by expanding BFS from outer borders
 * - Uses wider feathering band with cubic smoothstep to eliminate jagged rough edges
 */
export function processImageTransparentCanvas(img) {
  if (!img) return null;
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) return null;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;

  // 1. Sample outer border points from 4 directions + corners
  const samples = [];
  const addSample = (x, y) => {
    const idx = (y * w + x) * 4;
    samples.push({ r: d[idx], g: d[idx + 1], b: d[idx + 2], a: d[idx + 3] });
  };

  // 4 corners
  addSample(0, 0);
  addSample(w - 1, 0);
  addSample(0, h - 1);
  addSample(w - 1, h - 1);

  // 4 edges at 20%, 40%, 60%, 80%
  for (const f of [0.2, 0.4, 0.6, 0.8]) {
    addSample(Math.floor((w - 1) * f), 0);
    addSample(Math.floor((w - 1) * f), h - 1);
    addSample(0, Math.floor((h - 1) * f));
    addSample(w - 1, Math.floor((h - 1) * f));
  }

  // If already transparent PNG (most outer sample pixels are transparent), preserve original
  const transparentCount = samples.filter(s => s.a < 30).length;
  if (transparentCount >= 4) {
    return null;
  }

  // 2. Select boundary color closest to pure white (#ffffff) with luminance > 140
  let bestBg = null;
  let minWhiteDist = Infinity;
  for (const s of samples) {
    if (s.a < 100) continue;
    const lum = 0.299 * s.r + 0.587 * s.g + 0.114 * s.b;
    if (lum < 140) continue;
    const distToWhite = Math.hypot(255 - s.r, 255 - s.g, 255 - s.b);
    if (distToWhite < minWhiteDist) {
      minWhiteDist = distToWhite;
      bestBg = { r: s.r, g: s.g, b: s.b };
    }
  }

  if (!bestBg) return null;

  const bgR = bestBg.r;
  const bgG = bestBg.g;
  const bgB = bestBg.b;

  const visited = new Uint8Array(w * h);
  const queue = [];

  // Seed outer border pixels that match background color
  const isSeedMatch = (x, y) => {
    const idx = (y * w + x) * 4;
    const dist = Math.hypot(d[idx] - bgR, d[idx + 1] - bgG, d[idx + 2] - bgB);
    return dist <= 65;
  };

  for (let x = 0; x < w; x++) {
    if (isSeedMatch(x, 0)) { queue.push(x); visited[x] = 1; }
    const botP = (h - 1) * w + x;
    if (isSeedMatch(x, h - 1)) { queue.push(botP); visited[botP] = 1; }
  }
  for (let y = 1; y < h - 1; y++) {
    const leftP = y * w;
    if (isSeedMatch(0, y)) { queue.push(leftP); visited[leftP] = 1; }
    const rightP = y * w + (w - 1);
    if (isSeedMatch(w - 1, y)) { queue.push(rightP); visited[rightP] = 1; }
  }

  const tol = 28;
  const softTol = 65;
  let head = 0;

  while (head < queue.length) {
    const p = queue[head++];
    const px = p % w;
    const py = Math.floor(p / w);
    const idx = p * 4;

    const r = d[idx];
    const g = d[idx + 1];
    const b = d[idx + 2];
    const dist = Math.hypot(r - bgR, g - bgG, b - bgB);

    if (dist <= tol) {
      d[idx + 3] = 0; // Transparent
      // 4-way expansion
      if (px > 0 && !visited[p - 1]) { visited[p - 1] = 1; queue.push(p - 1); }
      if (px < w - 1 && !visited[p + 1]) { visited[p + 1] = 1; queue.push(p + 1); }
      if (py > 0 && !visited[p - w]) { visited[p - w] = 1; queue.push(p - w); }
      if (py < h - 1 && !visited[p + w]) { visited[p + w] = 1; queue.push(p + w); }
    } else if (dist <= softTol) {
      // Cubic smoothstep for anti-aliasing to remove jaggedness
      const t = (dist - tol) / (softTol - tol);
      const smoothRatio = t * t * (3 - 2 * t);
      d[idx + 3] = Math.round(d[idx + 3] * smoothRatio);
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL('image/png');
}

/**
 * Preload all character cutscene images
 */
export function preloadBattleCutsceneImages(teamA, teamB) {
  const allUnits = [
    ...(teamA?.characters || []),
    ...(teamB?.characters || [])
  ];

  for (const unit of allUnits) {
    const raw = unit.raw || {};
    const imgUrl = raw.Character_Image_Full || raw.Character_Image_Long || raw.Character_Image || unit.image || '';
    if (imgUrl && !cutsceneImageCache.has(imgUrl) && (imgUrl.startsWith('http') || imgUrl.startsWith('data:'))) {
      const img = new Image();
      img.src = imgUrl;
      cutsceneImageCache.set(imgUrl, imgUrl);
    }
  }
}

/**
 * Ultimate Skill Cutscene Animation
 * Player 1 (Team A): slides horizontally from left at 7 o'clock
 * Player 2 (Team B): slides horizontally from right at 1 o'clock
 */
export function triggerUltimateCutscene(data) {
  const owner = data?.owner;
  const card = data?.card;
  const team = data?.team;
  if (!owner || !card) return;

  const teamId = team?.teamId || owner?.teamId || 'TEAM_A';
  const isPlayer1 = (teamId === 'TEAM_A');
  const raw = owner.raw || {};
  const charImg = raw.Character_Image_Full || raw.Character_Image_Long || raw.Character_Image || owner.image || '';
  const charName = owner.name || raw.Character_Name || '캐릭터';
  const skillName = card.skillName || card.rawSkill?.Skill_Name || card.skillData?.Skill_Name || '궁극기';

  const container = document.getElementById('battle-arena-view') || document.body;

  // Clear existing cutscene overlays on this side only so P1 and P2 do not abort each other (Battle 1)
  const sideClass = isPlayer1 ? 'cutscene-p1-7oclock' : 'cutscene-p2-1oclock';
  const existing = container.querySelectorAll(`.arena-ultimate-cutscene-overlay.${sideClass}`);
  existing.forEach(el => el.remove());

  const overlay = document.createElement('div');
  overlay.className = `arena-ultimate-cutscene-overlay ${isPlayer1 ? 'cutscene-p1-7oclock' : 'cutscene-p2-1oclock'}`;

  const displayImg = charImg;

  overlay.innerHTML = `
    <div class="cutscene-actor-unit">
      <div class="cutscene-portrait-wrap">
        <img src="${displayImg}" alt="${charName}" class="cutscene-char-image">
        <div class="cutscene-bottom-text-overlay">
          <span class="cutscene-char-name">${charName}</span>
          <span class="cutscene-skill-divider">✦</span>
          <span class="cutscene-skill-title">${skillName}</span>
        </div>
      </div>
    </div>
  `;

  container.appendChild(overlay);

  // Auto clean-up after 4.5s animation completion
  setTimeout(() => {
    if (overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
  }, 4500);
}

/**
 * Floating Skill Nameplate Banner for Basic Skills, Unique Skills, and Counters
 * Displays a clean horizontal pill at 7 o'clock (P1) or 1 o'clock (P2) without full body illustration
 */
export function triggerSkillNameplateBanner(data) {
  const owner = data?.owner;
  if (!owner) return;

  const card = data.card;
  const isCounter = Boolean(data.isCounter);
  const teamId = data.team?.teamId || owner.teamId || 'TEAM_A';
  const isPlayer1 = (teamId === 'TEAM_A');
  const charName = owner.name || owner.raw?.Character_Name || '캐릭터';
  const skillName = isCounter ? '반격' : (card?.skillName || card?.rawSkill?.Skill_Name || card?.skillData?.Skill_Name || data.skillName || '스킬');

  const container = document.getElementById('battle-arena-view') || document.body;

  // Clear existing nameplate on this side to prevent stacking
  const existing = container.querySelectorAll(`.arena-skill-nameplate-overlay.${isPlayer1 ? 'skill-nameplate-p1' : 'skill-nameplate-p2'}`);
  existing.forEach(el => el.remove());

  const overlay = document.createElement('div');
  overlay.className = `arena-skill-nameplate-overlay ${isPlayer1 ? 'skill-nameplate-p1' : 'skill-nameplate-p2'}`;

  const icon = isCounter ? '♻️' : (card?.cardType === CardType.UNIQUE ? '✨' : '⚔️');
  const titleColorClass = isCounter ? 'skill-title-counter' : (card?.cardType === CardType.UNIQUE ? 'skill-title-unique' : '');

  overlay.innerHTML = `
    <div class="cutscene-bottom-text-overlay skill-nameplate-banner">
      <span class="cutscene-char-name">${charName}</span>
      <span class="cutscene-skill-divider">✦</span>
      <span class="cutscene-skill-title ${titleColorClass}">${icon ? icon + ' ' : ''}${skillName}</span>
    </div>
  `;

  container.appendChild(overlay);

  setTimeout(() => {
    if (overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
  }, 1900);
}

/**
 * Keyword Status Floating Tooltip
 * Displays keyword icon, name, description, stack, turns, and immortality
 */
export function showKeywordFloatingTooltip(targetEl) {
  let tooltip = document.getElementById('arena-keyword-floating-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'arena-keyword-floating-tooltip';
    tooltip.className = 'arena-keyword-floating-tooltip';
    document.body.appendChild(tooltip);
  }

  const name = targetEl.getAttribute('data-kw-name') || '키워드';
  const iconVal = targetEl.getAttribute('data-kw-icon') || '✨';
  let desc = targetEl.getAttribute('data-kw-desc') || '';
  const stack = targetEl.getAttribute('data-kw-stack');
  const duration = targetEl.getAttribute('data-kw-duration');
  const immortal = targetEl.getAttribute('data-kw-immortal');
  let color = targetEl.getAttribute('data-kw-color');
  let type = targetEl.getAttribute('data-kw-type');

  // Fallback lookup if description is empty or default placeholder
  if (!desc || desc === '효과 설명이 없습니다.' || desc === '키워드 효과 설명이 없습니다.') {
    const info = getKeywordInfo(name);
    if (info) {
      if (info.Keyword_Desc) desc = info.Keyword_Desc;
      if (!color) color = (info.Keyword_Type === '디버프' ? '#ef4444' : '#38bdf8');
      if (!type) type = info.Keyword_Type;
    }
  }

  if (!color) {
    const isDebuff = DEBUFF_KEYWORDS_SET.has(name) || type === '디버프';
    color = isDebuff ? '#ef4444' : '#38bdf8';
  }
  if (!type) {
    type = DEBUFF_KEYWORDS_SET.has(name) ? '디버프' : '버프';
  }

  const isDebuff = (type === '디버프');
  const typeBadgeClass = isDebuff ? 'kw-fbadge-debuff' : 'kw-fbadge-buff';
  const typeBadgeText = isDebuff ? '디버프' : '버프';

  const isUrl = typeof iconVal === 'string' && (iconVal.startsWith('http://') || iconVal.startsWith('https://') || iconVal.endsWith('.png') || iconVal.endsWith('.webp') || iconVal.endsWith('.svg'));
  const iconHtml = isUrl
    ? `<img src="${iconVal}" alt="${name}" style="width:20px;height:20px;object-fit:contain;vertical-align:middle;">`
    : `<span style="font-size:1.15rem;vertical-align:middle;">${iconVal}</span>`;

  // Build badges
  const badges = [];
  badges.push(`<span class="kw-fbadge ${typeBadgeClass}">${typeBadgeText}</span>`);
  if (stack) {
    badges.push(`<span class="kw-fbadge kw-fbadge-stack">${stack} 중첩</span>`);
  }
  if (duration) {
    badges.push(`<span class="kw-fbadge kw-fbadge-turn">${duration}</span>`);
  }
  if (immortal && immortal !== '일반') {
    badges.push(`<span class="kw-fbadge kw-fbadge-immortal">★ 불멸</span>`);
  }

  // 10+ Stack Synergy Emphasis badge & conditional highlight
  const synergyTotal = Number(targetEl.getAttribute('data-kw-synergy-total')) || 0;
  const synergyGroup = targetEl.getAttribute('data-kw-synergy-group') || '';
  if (synergyTotal >= 10 && synergyGroup) {
    const groupNameMap = { Key_002: '파괴', Key_003: '매료', Key_004: '원소' };
    const grpLabel = groupNameMap[synergyGroup] || synergyGroup;
    badges.push(`<span class="kw-fbadge kw-fbadge-synergy-max" style="background:#dc2626; color:#fff; font-weight:bold; box-shadow:0 0 8px rgba(239,68,68,0.7);">⚡ ${grpLabel} 10스택 극대화 (합계 ${synergyTotal})</span>`);
    if (desc && desc.includes('10스택 이상이면')) {
      desc = desc.replace(/(10스택\s*이상이면[^,.]+)/g, '<span style="color:#fde047; font-weight:bold; text-decoration:underline;">$1 (활성화!)</span>');
    }
  }

  tooltip.innerHTML = `
    <div class="kw-floating-card" style="border-left: 4px solid ${color};">
      <div class="kw-floating-header">
        <div class="kw-floating-title-box">
          <span class="kw-floating-icon">${iconHtml}</span>
          <span class="kw-floating-name" style="color: ${color};">${name}</span>
        </div>
        <div class="kw-floating-badges">
          ${badges.join('')}
        </div>
      </div>
      <div class="kw-floating-body">
        <div class="kw-floating-desc">${desc || '효과 설명이 없습니다.'}</div>
      </div>
    </div>
  `;

  tooltip.style.display = 'block';

  // Position relative to targetEl and viewport bounds (Battle 4: prevent bottom clipping)
  const rect = targetEl.getBoundingClientRect();
  const tooltipWidth = 300;
  const tooltipHeight = tooltip.offsetHeight || 160;
  const isInsideCard = Boolean(targetEl.closest('.arena-char-card') || targetEl.closest('.arena-unit-card'));

  let left = rect.right + 10;
  let top = rect.top - 8;

  if (isInsideCard || (rect.bottom + tooltipHeight > window.innerHeight - 10)) {
    if (rect.top - tooltipHeight - 8 >= 10) {
      top = rect.top - tooltipHeight - 8;
      left = Math.min(Math.max(10, rect.left + (rect.width / 2) - (tooltipWidth / 2)), window.innerWidth - tooltipWidth - 12);
    } else {
      top = Math.max(10, window.innerHeight - tooltipHeight - 12);
      if (left + tooltipWidth > window.innerWidth - 12) {
        left = Math.max(10, rect.left - tooltipWidth - 10);
      }
    }
  } else {
    if (left + tooltipWidth > window.innerWidth - 12) {
      left = Math.max(10, rect.left - tooltipWidth - 10);
    }
    if (top + tooltipHeight > window.innerHeight - 10) {
      top = Math.max(10, window.innerHeight - tooltipHeight - 10);
    }
    if (top < 10) top = 10;
  }

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

export function hideKeywordFloatingTooltip() {
  const tooltip = document.getElementById('arena-keyword-floating-tooltip');
  if (tooltip) {
    tooltip.style.display = 'none';
  }
}

export function initKeywordFloatingTooltip() {
  if (window._arenaKeywordTooltipInited) return;
  window._arenaKeywordTooltipInited = true;

  document.addEventListener('mouseover', (e) => {
    const target = e.target.closest('.slot-icon[data-kw-name], .arena-status-slot-row[data-kw-name], .kw-desc-highlight[data-kw-name], [data-kw-name]');
    if (target && target.dataset?.kwName) {
      showKeywordFloatingTooltip(target);
    }
  });

  document.addEventListener('mouseout', (e) => {
    const fromTarget = e.target.closest('.slot-icon[data-kw-name], .arena-status-slot-row[data-kw-name], .kw-desc-highlight[data-kw-name], [data-kw-name]');
    const toTarget = e.relatedTarget ? e.relatedTarget.closest('.slot-icon[data-kw-name], .arena-status-slot-row[data-kw-name], .kw-desc-highlight[data-kw-name], [data-kw-name]') : null;
    if (fromTarget && fromTarget !== toTarget) {
      hideKeywordFloatingTooltip();
    }
  });
}

window.initKeywordFloatingTooltip = initKeywordFloatingTooltip;
window.showKeywordFloatingTooltip = showKeywordFloatingTooltip;
window.hideKeywordFloatingTooltip = hideKeywordFloatingTooltip;
window.formatSkillDescriptionText = formatSkillDescriptionText;
window.getKeywordInfo = getKeywordInfo;

// Auto-initialize floating tooltip globally
if (typeof document !== 'undefined') {
  initKeywordFloatingTooltip();
}

let wasPausedBeforeRsc = false;

/**
 * Show Large Red Superchat Awakening Modal (Central Dialog)
 */
function showRedSuperchatModal(data) {
  const modal = document.getElementById('arena-rsc-modal');
  if (!modal) return;

  const cardModal = document.getElementById('arena-card-modal');
  if (cardModal && cardModal.classList.contains('active')) {
    cardModal.classList.remove('active');
    if (!pendingCardSelection && activeArenaEngine?.state?.currentTurnHand) {
      pendingCardSelection = { hand: activeArenaEngine.state.currentTurnHand, isQuickExtraTurn: false };
    }
  }

  wasPausedBeforeRsc = isPaused;
  isPaused = true;
  updatePlayPauseButton();

  const char = data?.character || data?.target;
  const isBreaking = !!(data?.isBreaking || char?.isBreaking);
  const teamId = data?.team?.teamId || char?.teamId || 'TEAM_A';
  const isTeamA = (teamId === 'TEAM_A');

  const contentEl = modal.querySelector('.arena-rsc-modal-content');
  if (contentEl) {
    contentEl.classList.toggle('rsc-team-p1', isTeamA);
    contentEl.classList.toggle('rsc-team-p2', !isTeamA);
  }

  const headerTitle = modal.querySelector('.rsc-modal-header h2');
  if (headerTitle) {
    headerTitle.innerHTML = isTeamA
      ? `💥 <span class="rsc-header-team-p1">[플레이어 1 · 아군]</span> 아카스파 각성 발동!`
      : `💥 <span class="rsc-header-team-p2">[플레이어 2 · 적군]</span> 아카스파 각성 발동!`;
  }

  const portraitEl = document.getElementById('rsc-modal-portrait');
  if (portraitEl && char) {
    const raw = char.raw || {};
    portraitEl.src = raw.Character_Image_Long || raw.Character_Image_Full || raw.Character_Image || raw.Character_Portrait || '';
  }

  const nameEl = document.getElementById('rsc-modal-char-name');
  if (nameEl && char) {
    nameEl.textContent = char.name || '캐릭터';
  }

  const teamTag = document.getElementById('rsc-modal-tag-team');
  if (teamTag) {
    teamTag.textContent = isTeamA ? '🛡️ 플레이어 1 (아군)' : '⚔️ 플레이어 2 (적군)';
    teamTag.className = `rsc-tag ${isTeamA ? 'rsc-tag-p1' : 'rsc-tag-p2'}`;
    teamTag.removeAttribute('style');
  }

  const roleTag = document.getElementById('rsc-modal-tag-role');
  if (roleTag && char) {
    const rawRoleStr = char.raw?.Character_Role || char.role || char.mainRole || '탱커';
    const rawRoleParts = String(rawRoleStr).split(/[\/,]/).map(s => s.trim()).filter(Boolean);
    const koreanRoles = rawRoleParts.map(r => getKoreanRoleName(r));
    roleTag.textContent = koreanRoles.join(' / ');
  }

  const statusTag = document.getElementById('rsc-modal-tag-status');
  if (statusTag) {
    statusTag.textContent = isBreaking ? '💥 브레이킹 각성' : '🧧 아카스파 각성';
  }

  const confirmBtn = document.getElementById('btn-close-rsc-modal');
  if (confirmBtn) {
    confirmBtn.textContent = isTeamA ? '🛡️ 아군 각성 확인 (전투 재개)' : '⚔️ 적군 각성 확인 (전투 재개)';
  }

  const descEl = document.getElementById('rsc-modal-effect-desc');
  if (descEl && char) {
    const rsc = char.redSuperchat || {};
    const effectText = rsc.description || data?.effectDesc || '전투 능력치 대폭 강화';
    const breakingNotice = isBreaking ? '<br><span style="color:#fbbf24; font-weight:bold;">⚡ 브레이킹 즉시 해제 & BP 100% 완충!</span>' : '';
    descEl.innerHTML = `
      <div style="font-size:1.15rem; color:#fde047; margin-bottom:6px; font-weight:bold;">${rsc.name || '아카스파 각성'}</div>
      <div style="color:#f8fafc; font-size:1rem; line-height:1.5;">${effectText}${breakingNotice}</div>
    `;
  }

  modal.classList.add('active');
}

function closeRedSuperchatModal() {
  const modal = document.getElementById('arena-rsc-modal');
  if (modal) modal.classList.remove('active');

  if (!wasPausedBeforeRsc) {
    isPaused = false;
    updatePlayPauseButton();
  }

  // Open skill card selection modal if it was waiting for RSC modal to close (Item 3)
  if (pendingCardSelection) {
    const { hand, isQuickExtraTurn } = pendingCardSelection;
    pendingCardSelection = null;
    if (activeArenaEngine && (activeArenaEngine.state.battlePhase === BattlePhase.CARD_SELECTION || activeArenaEngine.state.battlePhase === 'CARD_SELECTION')) {
      openCardSelectionModal(hand, isQuickExtraTurn);
    }
  }
}

/**
 * Open Full-Size Character Info Modal during Battle (Item 4)
 * Pauses battle while modal is open, shows Standard vs Buffed combat stats
 */
export function openBattleCharInfoModal(targetChar) {
  if (!targetChar) return;
  wasPausedBeforeCharModal = isPaused;
  isPaused = true;
  updatePlayPauseButton();

  import('./ui.js?v=004276').then(ui => {
    window._onCharInfoModalClosed = () => {
      if (!wasPausedBeforeCharModal) {
        isPaused = false;
        updatePlayPauseButton();
      }
      window._onCharInfoModalClosed = null;
    };
    ui.openCharInfoModal(targetChar.raw, false, true, targetChar);
  }).catch(err => {
    console.error('[Arena Character Modal Error]:', err);
    if (!wasPausedBeforeCharModal) {
      isPaused = false;
      updatePlayPauseButton();
    }
  });
}


/**
 * Open Damage / Healing / Battle Metrics Stats Graph Modal (10 Metrics Analysis)
 */
function openStatsModal() {
  const modal = document.getElementById('arena-stats-modal');
  const body = document.getElementById('arena-stats-body');
  if (!modal || !body) return;

  modal.classList.add('active');

  const renderTeamTable = (teamKey, teamName, teamColor) => {
    const list = Object.values(damageStats[teamKey] || {});
    if (list.length === 0) {
      return `
        <div class="stats-table-card">
          <h4 style="color:${teamColor}; margin: 4px 0 8px 0;">${teamName}</h4>
          <div style="color:#94a3b8; font-size:0.85rem;">기록된 전투 데이터가 없습니다.</div>
        </div>
      `;
    }

    // Top metrics for highlight
    const maxDmg = Math.max(1, ...list.map(x => x.damageDealt || 0));
    const maxTaken = Math.max(1, ...list.map(x => x.damageTaken || 0));
    const maxShield = Math.max(1, ...list.map(x => x.shieldGiven || 0));
    const maxHeal = Math.max(1, ...list.map(x => x.healingDone || 0));
    const maxKill = Math.max(1, ...list.map(x => x.killCount || 0));

    // Totals
    const totDmg = list.reduce((sum, x) => sum + (x.damageDealt || 0), 0);
    const totTaken = list.reduce((sum, x) => sum + (x.damageTaken || 0), 0);
    const totShield = list.reduce((sum, x) => sum + (x.shieldGiven || 0), 0);
    const totHeal = list.reduce((sum, x) => sum + (x.healingDone || 0), 0);
    const totEva = list.reduce((sum, x) => sum + (x.evasionCount || 0), 0);
    const totCards = list.reduce((sum, x) => sum + (x.cardsUsed || 0), 0);
    const totOverheat = list.reduce((sum, x) => sum + (x.overheatTotal || 0), 0);
    const totUlts = list.reduce((sum, x) => sum + (x.ultCount || 0), 0);
    const totKills = list.reduce((sum, x) => sum + (x.killCount || 0), 0);
    const totCrits = list.reduce((sum, x) => sum + (x.critCount || 0), 0);

    const rows = list.map(item => {
      const rawRoleStr = item.raw?.Character_Role || item.mainRole || '탱커';
      const rawRoleParts = String(rawRoleStr).split(/[\/,]/).map(s => s.trim()).filter(Boolean);
      const kRole = rawRoleParts.map(r => getKoreanRoleName(r)).join('/');
      const isTopDmg = (item.damageDealt > 0 && item.damageDealt === maxDmg);
      const isTopKill = (item.killCount > 0 && item.killCount === maxKill);
      const isTopHeal = (item.healingDone > 0 && item.healingDone === maxHeal);
      const isTopShield = (item.shieldGiven > 0 && item.shieldGiven === maxShield);

      return `
        <tr>
          <td style="text-align:left; font-weight:bold;">
            <div>${item.name} <span style="font-size:0.7rem; color:#94a3b8; font-weight:normal;">(${kRole})</span></div>
            <div style="font-size:0.72rem; font-weight:normal; margin-top:2px;">
              <span style="color:#facc15; font-weight:bold;">⭐${item.star || 1}</span>
              <span style="color:#38bdf8; font-weight:bold; margin-left:4px;">Lv.${item.level || 1}</span>
            </div>
          </td>
          <td class="${isTopDmg ? 'stats-val-highlight' : ''}">${(item.damageDealt || 0).toLocaleString()}</td>
          <td>${(item.damageTaken || 0).toLocaleString()}</td>
          <td class="${isTopShield ? 'stats-val-highlight' : ''}">${(item.shieldGiven || 0).toLocaleString()}</td>
          <td class="${isTopHeal ? 'stats-val-highlight' : ''}">${(item.healingDone || 0).toLocaleString()}</td>
          <td>${item.evasionCount || 0}</td>
          <td>${item.cardsUsed || 0}</td>
          <td style="color:${(item.overheatTotal || 0) > 0 ? '#f87171' : ((item.overheatTotal || 0) < 0 ? '#38bdf8' : '#cbd5e1')};">${(item.overheatTotal || 0) > 0 ? `+${item.overheatTotal}` : (item.overheatTotal || 0)}</td>
          <td>${item.ultCount || 0}</td>
          <td class="${isTopKill ? 'stats-val-highlight' : ''}">${item.killCount || 0}</td>
          <td>${item.critCount || 0}</td>
        </tr>
      `;
    }).join('');

    return `
      <div class="stats-table-card">
        <h4 style="color:${teamColor}; margin: 4px 0 10px 0; font-size: 1rem; display: flex; justify-content: space-between;">
          <span>${teamName}</span>
          <span style="font-size: 0.8rem; color: #94a3b8; font-weight: normal;">총 딜량: ${totDmg.toLocaleString()} | 총 처치: ${totKills}</span>
        </h4>
        <div style="overflow-x: auto;">
          <table class="stats-char-table">
            <thead>
              <tr>
                <th style="text-align:left;">캐릭터</th>
                <th>⚔️ 피해량</th>
                <th>🛡️ 피격량</th>
                <th>🔘 보호막</th>
                <th>💚 치유량</th>
                <th>💨 회피</th>
                <th>🎴 카드</th>
                <th>🔥 오버히트</th>
                <th>🌟 궁극기</th>
                <th>☠️ 처치</th>
                <th>💥 치명타</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
              <tr style="background: rgba(255,255,255,0.05); font-weight: bold; border-top: 1px solid rgba(255,255,255,0.15);">
                <td style="text-align:left; color:#f1c40f;">합계 (TEAM)</td>
                <td>${totDmg.toLocaleString()}</td>
                <td>${totTaken.toLocaleString()}</td>
                <td>${totShield.toLocaleString()}</td>
                <td>${totHeal.toLocaleString()}</td>
                <td>${totEva}</td>
                <td>${totCards}</td>
                <td style="color:${totOverheat > 0 ? '#f87171' : (totOverheat < 0 ? '#38bdf8' : '#cbd5e1')};">${totOverheat > 0 ? `+${totOverheat}` : totOverheat}</td>
                <td>${totUlts}</td>
                <td>${totKills}</td>
                <td>${totCrits}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
  };

  body.innerHTML = `
    <div class="stats-grid-container">
      ${renderTeamTable('TEAM_A', '아군 팀 (TEAM A)', '#38bdf8')}
      ${renderTeamTable('TEAM_B', '적군 팀 (TEAM B)', '#f87171')}
    </div>
  `;
}

function closeStatsModal() {
  const modal = document.getElementById('arena-stats-modal');
  if (modal) modal.classList.remove('active');
}

/**
 * Show Victory / Defeat Result Modal
 */
function showBattleResultModal(result) {
  const modal = document.getElementById('arena-result-modal');
  const title = document.getElementById('arena-result-title');
  const desc = document.getElementById('arena-result-desc');
  if (!modal) return;

  const isWin = (result === 'PLAYER_WIN');
  if (title) {
    title.textContent = isWin ? '🏆 VICTORY!' : '💀 DEFEAT';
    title.style.color = isWin ? '#10b981' : '#ef4444';
  }

  if (desc && activeArenaEngine) {
    const s = activeArenaEngine.state;
    const aliveA = s.teamA?.characters ? s.teamA.characters.filter(c => !c.isDead && c.hp > 0).length : 0;
    const aliveB = s.teamB?.characters ? s.teamB.characters.filter(c => !c.isDead && c.hp > 0).length : 0;
    desc.innerHTML = `
      전투 결과: <b>${isWin ? '아군 승리' : '적군 승리'}</b><br>
      총 진행 턴: <b>${s.turnCount} 턴</b> | 총 소요 시간: <b>${s.currentTick} 초</b><br>
      생존자: 아군 <b>${aliveA}명</b> vs 적군 <b>${aliveB}명</b>
    `;
  }

  const btnRestartResult = document.getElementById('btn-battle-result-restart');
  const btnExitResult = document.getElementById('btn-battle-result-exit');
  const isTestBattle = !window.activeBattleContext;

  if (btnRestartResult) {
    btnRestartResult.style.display = isTestBattle ? 'inline-block' : 'none';
  }
  if (btnExitResult) {
    btnExitResult.textContent = isTestBattle ? '🚪 로비로 나가기' : (isWin ? '🎁 보상 수령 및 나가기' : '🚪 나가기');
  }

  window.lastBattleResult = result;
  modal.classList.add('active');
}

function closeResultModal() {
  const modal = document.getElementById('arena-result-modal');
  if (modal) modal.classList.remove('active');
}

function handleBattleExit() {
  stopBattleBgm();
  if (typeof window.playNextRandomBgm === 'function') {
    window.playNextRandomBgm();
  }

  const ctx = window.activeBattleContext;
  const result = window.lastBattleResult;
  const isWin = (result === 'PLAYER_WIN');
  const isSurrendered = Boolean(window.isBattleSurrendered);
  window.isBattleSurrendered = false;

  // Fatigue deduction on manual battle (auto battle: 0 consumed, manual battle: -3 condition for deployed members)
  // Surrendered battles do not consume condition
  if (!isSurrendered && ctx && !isAutoBattleActive && activeArenaEngine && activeArenaEngine.state && activeArenaEngine.state.teamA) {
    activeArenaEngine.state.teamA.characters.forEach(c => {
      const charId = c.characterId;
      if (!charId || charId === 'NONE') return;
      if (!PlayerData.characterStats) PlayerData.characterStats = {};
      if (!PlayerData.characterStats[charId]) {
        PlayerData.characterStats[charId] = { level: 1, star: 1, exp: 0, bloom: 0, condition: 100 };
      }
      const curCond = PlayerData.characterStats[charId].condition !== undefined ? PlayerData.characterStats[charId].condition : 100;
      PlayerData.characterStats[charId].condition = Math.max(0, curCond - 3);
    });
    if (window.savePlayerData) window.savePlayerData();
  }

  const battleScene = document.getElementById('scene-battle');

  if (ctx && ctx.type === 'rehearsal') {
    const stage = ctx.stage;
    const defaultSceneId = (stage && stage.Stage_Type === '메인') ? 'scene-1' : 'scene-2';
    const returnSceneId = ctx.returnScene || defaultSceneId;
    const targetScene = document.getElementById(returnSceneId) || document.getElementById(defaultSceneId) || document.getElementById('main-scene');

    if (battleScene && targetScene && window.changeSceneWipe) {
      window.changeSceneWipe(battleScene, targetScene);
    }

    if (isWin) {
      const apCost = Number(ctx.apCost !== undefined ? ctx.apCost : (stage ? stage.Stage_AP : 0)) || 0;

      // Level difference penalty for rehearsal stage rewards:
      // 8명 합계가 150 레벨 이상 차이날 경우 50% 감소
      // 200레벨 이상 차이날 경우 75% 감소
      // 250레벨 이상 차이날 경우 90% 감소 (올림 처리)
      let levelPenaltyRate = (ctx.levelPenaltyRate !== undefined) ? Number(ctx.levelPenaltyRate) : 0;
      if (!levelPenaltyRate && stage.Stage_Level && activeArenaEngine && activeArenaEngine.state && activeArenaEngine.state.teamA && activeArenaEngine.state.teamA.characters) {
        const stageLevel = parseInt(stage.Stage_Level, 10) || 1;
        let totalDeckLevel = 0;
        activeArenaEngine.state.teamA.characters.forEach(c => {
          const cid = c.characterId;
          if (!cid || cid === 'NONE') return;
          const st = PlayerData.characterStats && PlayerData.characterStats[cid];
          totalDeckLevel += (st && st.level) ? Number(st.level) : 1;
        });
        const diff = totalDeckLevel - (stageLevel * 8);
        if (diff >= 250) levelPenaltyRate = 90;
        else if (diff >= 200) levelPenaltyRate = 75;
        else if (diff >= 150) levelPenaltyRate = 50;
      }
      const rewardMultiplier = levelPenaltyRate > 0 ? (1 - levelPenaltyRate / 100) : 1.0;

      // 1. Deduct AP
      PlayerData.ap = Math.max(0, (PlayerData.ap || 0) - apCost);

      // 2. Account EXP
      if (apCost > 0) {
        if (typeof addAccountExp === 'function') addAccountExp(apCost * 100);
        else if (typeof window.addAccountExp === 'function') window.addAccountExp(apCost * 100);
      }

      // 3. Mark clear
      const isFirstClear = !PlayerData.clearedStages || !PlayerData.clearedStages.includes(ctx.stageId);
      if (!PlayerData.clearedStages) PlayerData.clearedStages = [];
      if (isFirstClear) PlayerData.clearedStages.push(ctx.stageId);

      // Immediately reflect stage clear in UI and feature unlocks
      if (typeof window.renderMainStoryScene === 'function') {
        window.renderMainStoryScene();
      }
      if (typeof window.updateMainMenuFeatureLocks === 'function') {
        window.updateMainMenuFeatureLocks();
      }
      if (ctx.type === 'rehearsal' && window.lastRehearsalSubCategory && typeof window.openRehearsalSub === 'function') {
        window.openRehearsalSub(window.lastRehearsalSubCategory);
      }

      // 4. Rewards
      const rewardItems = [];
      const addReward = (str, isStageReward = false) => {
        if (!str) return;
        const parts = str.split(',');
        for (let i = 0; i < parts.length; i += 2) {
          const itemId = parts[i].trim();
          let count = parseInt(parts[i + 1]) || 1;
          if (isStageReward && rewardMultiplier < 1) {
            count = Math.ceil(count * rewardMultiplier);
          }
          if (itemId) {
            PlayerData.items[itemId] = (PlayerData.items[itemId] || 0) + count;
            const existing = rewardItems.find(r => r.id === itemId);
            if (existing) existing.count += count;
            else rewardItems.push({ id: itemId, count });
          }
        }
      };

      addReward(stage.Stage_Reward, true);
      const firstClearReward = stage.Stage_First_Reward || stage.Stage_Reward_First;
      if (isFirstClear && firstClearReward) {
        addReward(firstClearReward, false);
      }

            // Bonus issue reward based on Issue Point
      if (ctx.activeIssues && ctx.activeIssues.length > 0 && stage.Stage_Reward) {
        let totalPts = 0;
        const allIssues = GameData.issue || [];

        // Calculate total Issue Point
        ctx.activeIssues.forEach(id => {
          const iss = allIssues.find(i => i.Issue_ID === id);
          if (iss) {
            totalPts += Number(iss.Issue_Point || 0);
          }
        });

        if (totalPts > 0) {
          const parts = stage.Stage_Reward.split(',');

          for (let i = 0; i < parts.length; i += 2) {
            const itemId = parts[i].trim();
            const baseAmount = parseInt(parts[i + 1]) || 1;

            if (!itemId) continue;

            let bonusCount = 0;

            // Bulk rewards (e.g. Credits):
            // Issue Point 1P = +3% of the base reward
            if (baseAmount > 1) {
              bonusCount = Math.floor(baseAmount * (totalPts * 0.03));
            }
            // Single-item rewards (e.g. rare materials):
            // Issue Point 1P = +4% chance to obtain +1
            else {
              const bonusChance = totalPts * 0.04;
              const guaranteedBonus = Math.floor(bonusChance);
              const randomChance = bonusChance % 1;

              bonusCount += guaranteedBonus;

              if (Math.random() < randomChance) {
                bonusCount += 1;
              }
            }

            // Grant bonus reward
            if (bonusCount > 0) {
              PlayerData.items[itemId] = (PlayerData.items[itemId] || 0) + bonusCount;

              const existing = rewardItems.find(r => r.id === itemId);
              if (existing) {
                existing.count += bonusCount;
              } else {
                rewardItems.push({
                  id: itemId,
                  count: bonusCount
                });
              }
            }
          }
        }
      }

      if (window.updateTopCurrencies) window.updateTopCurrencies();
      if (window.updateAPUI) window.updateAPUI();
      if (window.savePlayerData) window.savePlayerData();

      setTimeout(() => {
        if (window.openStageRewardModal) {
          const penaltyNote = levelPenaltyRate > 0 ? ` (레벨 초과 기본 보상 ${levelPenaltyRate}% 감액 적용)` : '';
          window.openStageRewardModal({
            subtitle: `[${stage.Stage_Name}] 클리어 성공!${penaltyNote}`,
            exp: apCost * 100,
            items: rewardItems
          });
        }
      }, 350);
    } else {
      // Defeat: No AP deduction
      setTimeout(() => {
        if (window.openStageDefeatModal) {
          window.openStageDefeatModal();
        }
      }, 350);
    }

    window.activeBattleContext = null;
    window.pendingBattleContext = null;
    return;
  }

  if (ctx && ctx.type === 'live') {
    const stage = ctx.stage;
    const returnSceneId = ctx.returnScene || 'scene-3';
    const targetScene = document.getElementById(returnSceneId) || document.getElementById('scene-3') || document.getElementById('main-scene');

    if (battleScene && targetScene && window.changeSceneWipe) {
      window.changeSceneWipe(battleScene, targetScene);
    }

    if (isWin) {
      // Progress live
      if (!PlayerData.liveState) PlayerData.liveState = {};
      if (stage && stage.stageIssues) {
        if (!PlayerData.liveState.cumulativeIssues) PlayerData.liveState.cumulativeIssues = [];
        PlayerData.liveState.cumulativeIssues.push(...stage.stageIssues);
      }
      if (PlayerData.liveState.cumulativeBattles === undefined) PlayerData.liveState.cumulativeBattles = 0;
      PlayerData.liveState.cumulativeBattles++;

      if (PlayerData.liveState.accumulatedDia === undefined) PlayerData.liveState.accumulatedDia = 0;
      if (PlayerData.liveState.accumulatedTicket === undefined) PlayerData.liveState.accumulatedTicket = 0;

      if (stage.diaReward) PlayerData.liveState.accumulatedDia += stage.diaReward;
      if (stage.ticketReward) PlayerData.liveState.accumulatedTicket += stage.ticketReward;

      PlayerData.liveState.stages = null;
      if (window.savePlayerData) window.savePlayerData();

      setTimeout(() => {
        if (window.generateLiveStages) window.generateLiveStages(ctx.mode);
        if (window.updateTopCurrencies) window.updateTopCurrencies();
      }, 350);
    } else {
      // Defeat: Final settlement
      setTimeout(() => {
        if (window.settleLiveDefeat) {
          window.settleLiveDefeat();
        }
      }, 350);
    }

    window.activeBattleContext = null;
    window.pendingBattleContext = null;
    return;
  }

  // Default / Test battle
  const mainScene = document.getElementById('main-scene');
  if (battleScene && mainScene && window.changeSceneWipe) {
    window.changeSceneWipe(battleScene, mainScene);
  }
  window.activeBattleContext = null;
  window.pendingBattleContext = null;
}

function generateEnemyCore(char, tier) {
  const bonuses = { HP: 0, ATK: 0, IDOL: 0, DEF: 0, MDEF: 0, REG: 0, BP: 0, AGGRO: 0, HIT: 0, DODGE: 0, CRIT: 0, SPD: 0, CRIT_DMG: 0 };
  if (!tier || tier <= 0 || !window.GameData || !Array.isArray(window.GameData.coreOptions)) {
    return bonuses;
  }

  const charType = (char.Character_Type || '청초').trim();
  const validOpts = window.GameData.coreOptions.filter(o => {
    return String(o.Core_E_Tier) === String(tier) && (o.Core_E_Element === '공용' || o.Core_E_Element === charType);
  });

  if (validOpts.length === 0) return bonuses;

  const shuffled = [...validOpts].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, 3);

  selected.forEach(opt => {
    const min = Number(opt.Core_E_Min) || 0;
    const max = Number(opt.Core_E_Max) || min;
    const val = min === max ? min : Math.floor(Math.random() * (max - min + 1)) + min;
    const statName = opt.Core_E_Desc;

    if (statName === 'HP') bonuses.HP += val;
    else if (statName === '공격력') bonuses.ATK += val;
    else if (statName === '아이돌력') bonuses.IDOL += val;
    else if (statName === '방어력') bonuses.DEF += val;
    else if (statName === '마법방어력') bonuses.MDEF += val;
    else if (statName === '저항력') bonuses.REG += val;
    else if (statName === '어그로') bonuses.AGGRO += val;
    else if (statName === '명중') bonuses.HIT += val;
    else if (statName === '회피') bonuses.DODGE += val;
    else if (statName === '치명타') bonuses.CRIT += val;
    else if (statName === '속도') bonuses.SPD += val;
    else if (statName === '치명타 피해량') bonuses.CRIT_DMG += val;
    else if (statName === '브레이킹') bonuses.BP += val;
  });

  return bonuses;
}

function buildPlayerBattleCharacter(char, charStats = {}, formationPosition = 1) {
  const level = Number(charStats.level || 1);
  const star = Number(charStats.star || 1);
  const bloomLevel = Number(charStats.bloom || 0);

  const atkUp = parseInt(char.Character_ATK_UP || char.Character_ATK_Up || 1, 10);
  const idolUp = parseInt(char.Character_Idol_UP || char.Character_Idol_Up || 1, 10);
  const hpUp = parseInt(char.Character_HP_UP || char.Character_HP_Up || 1, 10);

  const levelDiff = level === 1 ? 0 : Math.floor(level / 10);

  let hp = (parseInt(char.Character_HP, 10) || 0) + (levelDiff * hpUp);
  let atk = (parseInt(char.Character_ATK, 10) || 0) + (levelDiff * atkUp);
  let idol = (parseInt(char.Character_Idol, 10) || 0) + (levelDiff * idolUp);
  let bp = parseInt(char.Character_BP, 10) || 5;
  let aggro = parseInt(char.Character_Aggro, 10) || 5;
  let def = parseInt(char.Character_DEF || char.Character_Physical_DEF, 10) || 20;
  let mdef = parseInt(char.Character_MDEF || char.Character_Magical_DEF, 10) || 20;
  let reg = parseInt(char.Character_REG, 10) || 0;
  let hitrate = parseInt(char.Character_HitRate, 10) || 100;
  let dodge = parseInt(char.Character_Dodge, 10) || 5;
  let crit = parseInt(char.Character_Crit, 10) || 5;
  let spd = parseInt(char.Character_Spd, 10) || 10;

  // 1. Bloom Bonus
  let bloomBonus = { HP: 0, ATK: 0, IDOL: 0, DEF: 0, MDEF: 0, REG: 0, BP: 0, AGGRO: 0, HIT: 0, DODGE: 0, CRIT: 0, SPD: 0 };
  if (GameData.bloom && bloomLevel > 0) {
    const roles = (char.Character_Role || "").split(/[,/]/).map(s => s.trim()).filter(Boolean);
    const validBloomRoles = new Set(GameData.bloom.map(b => b.Role));
    const primaryRole = roles.find(r => validBloomRoles.has(r)) || roles[0] || "";
    GameData.bloom.forEach(effect => {
      if (effect.Role === primaryRole && effect.Level <= bloomLevel) {
        const val = effect.Value;
        switch (effect.Type) {
          case 'HP_PCT': bloomBonus.HP += Math.floor(hp * (val / 100)); break;
          case 'HP_ADD': bloomBonus.HP += val; break;
          case 'ATK_PCT': bloomBonus.ATK += Math.floor(atk * (val / 100)); break;
          case 'ATK_ADD': bloomBonus.ATK += val; break;
          case 'IDOL_PCT': bloomBonus.IDOL += Math.floor(idol * (val / 100)); break;
          case 'IDOL_ADD': bloomBonus.IDOL += val; break;
          case 'BP_ADD': bloomBonus.BP += val; break;
          case 'HIT_PCT': bloomBonus.HIT += val; break;
          case 'AVOID_PCT': bloomBonus.DODGE += val; break;
          case 'CRIT_PCT': bloomBonus.CRIT += val; break;
          case 'SPD_ADD': bloomBonus.SPD += val; break;
          case 'RES_ADD': bloomBonus.REG += val; break;
        }
      }
    });
  }

  // 2. Core Bonus
  let coreBonus = { HP: 0, ATK: 0, IDOL: 0, DEF: 0, MDEF: 0, REG: 0, BP: 0, AGGRO: 0, HIT: 0, DODGE: 0, CRIT: 0, SPD: 0, CRIT_DMG: 0 };
  if (charStats.equippedCoreUid && PlayerData.cores) {
    const core = PlayerData.cores.find(c => c.uid === charStats.equippedCoreUid);
    if (core && core.slots && GameData.coreOptions) {
      core.slots.forEach(slot => {
        const optDef = GameData.coreOptions.find(o => o.Core_E_ID === slot.optionId);
        if (optDef) {
          const statName = optDef.Core_E_Desc;
          if (statName === 'HP') coreBonus.HP += slot.value;
          else if (statName === '공격력') coreBonus.ATK += slot.value;
          else if (statName === '아이돌력') coreBonus.IDOL += slot.value;
          else if (statName === '방어력') coreBonus.DEF += slot.value;
          else if (statName === '마법방어력') coreBonus.MDEF += slot.value;
          else if (statName === '저항력') coreBonus.REG += slot.value;
          else if (statName === '어그로') coreBonus.AGGRO += slot.value;
          else if (statName === '명중') coreBonus.HIT += slot.value;
          else if (statName === '회피') coreBonus.DODGE += slot.value;
          else if (statName === '치명타') coreBonus.CRIT += slot.value;
          else if (statName === '속도') coreBonus.SPD += slot.value;
          else if (statName === '치명타 피해량') coreBonus.CRIT_DMG += slot.value;
          else if (statName === '브레이킹') coreBonus.BP += slot.value;
        }
      });
    }
  }

  // 3. Kizuna Bonus
  let kizunaBonus = { HP: 0, ATK: 0, IDOL: 0, DEF: 0, MDEF: 0, REG: 0, BP: 0, AGGRO: 0, HIT: 0, DODGE: 0, CRIT: 0, SPD: 0, CRIT_DMG: 0 };
  if (GameData.kizuna && PlayerData.kizunaTree) {
    const charTags = [
      ...(char.Character_MainTag || "").split(/[,/]/),
      ...(char.Character_SubTag || "").split(/[,/]/),
      ...(char.Character_Type || "").split(/[,/]/)
    ].map(t => t.trim()).filter(t => t);

    for (let [nodeId, kLevel] of Object.entries(PlayerData.kizunaTree || {})) {
      if (kLevel > 0) {
        const kNode = GameData.kizuna.find(k => k.Kizuna_ID === nodeId);
        if (kNode) {
          let isMatch = true;
          const target = (kNode.Kizuna_Target || "").trim();
          if (target && target !== '전체' && target !== '모든' && target.toLowerCase() !== 'all') {
            if (!charTags.includes(target)) isMatch = false;
          }
          if (isMatch) {
            const statMap = {
              'HP': 'HP', '체력': 'HP', '공격력': 'ATK', 'ATK': 'ATK', '아이돌력': 'IDOL', 'IDOL': 'IDOL',
              '방어력': 'DEF', '물리방어': 'DEF', 'DEF': 'DEF', '마법방어력': 'MDEF', '마법방어': 'MDEF', 'MDEF': 'MDEF',
              '명중': 'HIT', 'HIT': 'HIT', '회피': 'DODGE', 'DODGE': 'DODGE', '치명타': 'CRIT', 'CRIT': 'CRIT',
              '치명타피해량': 'CRIT_DMG', '치명타 피해량': 'CRIT_DMG', '치피': 'CRIT_DMG'
            };
            const addStat = (statName, statVal) => {
              if (statName && statVal) {
                const field = statMap[statName.trim()];
                if (field) kizunaBonus[field] += (parseFloat(statVal) || 0) * kLevel;
              }
            };
            addStat(kNode.Kizuna_Stat_1, kNode.Kizuna_Value_1);
            addStat(kNode.Kizuna_Stat_2, kNode.Kizuna_Value_2);
          }
        }
      }
    }
  }

  const finalHp = Math.max(1, hp + bloomBonus.HP + coreBonus.HP + kizunaBonus.HP);
  const finalAtk = Math.max(0, atk + bloomBonus.ATK + coreBonus.ATK + kizunaBonus.ATK);
  const finalIdol = Math.max(0, idol + bloomBonus.IDOL + coreBonus.IDOL + kizunaBonus.IDOL);
  const finalDef = Math.max(0, def + bloomBonus.DEF + coreBonus.DEF + kizunaBonus.DEF);
  const finalMdef = Math.max(0, mdef + bloomBonus.MDEF + coreBonus.MDEF + kizunaBonus.MDEF);
  const finalBp = Math.max(1, bp + bloomBonus.BP + coreBonus.BP + kizunaBonus.BP);
  const finalAggro = Math.max(1, aggro + bloomBonus.AGGRO + coreBonus.AGGRO + kizunaBonus.AGGRO);
  const finalReg = Math.max(0, reg + bloomBonus.REG + coreBonus.REG + kizunaBonus.REG);
  const finalHit = Math.max(0, hitrate + bloomBonus.HIT + coreBonus.HIT + kizunaBonus.HIT);
  const finalDodge = Math.max(0, dodge + bloomBonus.DODGE + coreBonus.DODGE + kizunaBonus.DODGE);
  const finalCrit = Math.max(0, crit + bloomBonus.CRIT + coreBonus.CRIT + kizunaBonus.CRIT);
  const finalSpd = Math.max(1, spd + bloomBonus.SPD + coreBonus.SPD + kizunaBonus.SPD);
  const finalCritDmg = (150 + coreBonus.CRIT_DMG + kizunaBonus.CRIT_DMG) / 100;

  return createCharacterBattleState(char, 'TEAM_A', formationPosition, {
    level,
    star,
    skillMastery: (star >= 2) ? (charStats.skillMastery || { SS: 0, AS: 0 }) : { SS: 0, AS: 0 },
    hp: finalHp,
    maxHp: finalHp,
    atk: finalAtk,
    idolPower: finalIdol,
    def: finalDef,
    mdef: finalMdef,
    maxBreak: finalBp,
    currentBreak: finalBp,
    aggro: finalAggro,
    reg: finalReg,
    accuracy: finalHit,
    evasion: finalDodge,
    critChance: finalCrit,
    speed: finalSpd,
    critDmg: finalCritDmg
  });
}

function buildEnemyBattleCharacter(char, level, star, stageCore, formationPosition, stageMaster = 0) {
  const atkUp = parseInt(char.Character_ATK_UP || char.Character_ATK_Up || 1, 10);
  const idolUp = parseInt(char.Character_Idol_UP || char.Character_Idol_Up || 1, 10);
  const hpUp = parseInt(char.Character_HP_UP || char.Character_HP_Up || 1, 10);

  const levelDiff = level === 1 ? 0 : Math.floor(level / 10);

  let hp = (parseInt(char.Character_HP, 10) || 0) + (levelDiff * hpUp);
  let atk = (parseInt(char.Character_ATK, 10) || 0) + (levelDiff * atkUp);
  let idol = (parseInt(char.Character_Idol, 10) || 0) + (levelDiff * idolUp);
  let bp = parseInt(char.Character_BP, 10) || 5;
  let aggro = parseInt(char.Character_Aggro, 10) || 5;
  let def = parseInt(char.Character_DEF || char.Character_Physical_DEF, 10) || 20;
  let mdef = parseInt(char.Character_MDEF || char.Character_Magical_DEF, 10) || 20;
  let reg = parseInt(char.Character_REG, 10) || 0;
  let hitrate = parseInt(char.Character_HitRate, 10) || 100;
  let dodge = parseInt(char.Character_Dodge, 10) || 5;
  let crit = parseInt(char.Character_Crit, 10) || 5;
  let spd = parseInt(char.Character_Spd, 10) || 10;

  // Only 2★ and 3★ characters receive cores if stageCore > 0
  const coreBonus = (star >= 2 && stageCore > 0)
    ? generateEnemyCore(char, stageCore)
    : { HP: 0, ATK: 0, IDOL: 0, DEF: 0, MDEF: 0, REG: 0, BP: 0, AGGRO: 0, HIT: 0, DODGE: 0, CRIT: 0, SPD: 0, CRIT_DMG: 0 };

  const finalHp = Math.max(1, hp + coreBonus.HP);
  const finalAtk = Math.max(0, atk + coreBonus.ATK);
  const finalIdol = Math.max(0, idol + coreBonus.IDOL);
  const finalDef = Math.max(0, def + coreBonus.DEF);
  const finalMdef = Math.max(0, mdef + coreBonus.MDEF);
  const finalBp = Math.max(1, bp + coreBonus.BP);
  const finalAggro = Math.max(1, aggro + coreBonus.AGGRO);
  const finalReg = Math.max(0, reg + coreBonus.REG);
  const finalHit = Math.max(0, hitrate + coreBonus.HIT);
  const finalDodge = Math.max(0, dodge + coreBonus.DODGE);
  const finalCrit = Math.max(0, crit + coreBonus.CRIT);
  const finalSpd = Math.max(1, spd + coreBonus.SPD);
  const finalCritDmg = (150 + coreBonus.CRIT_DMG) / 100;

  const finalMastery = (star >= 2) ? Math.max(0, parseInt(stageMaster) || 0) : 0;

  return createCharacterBattleState(char, 'TEAM_B', formationPosition, {
    level,
    star,
    skillMastery: { SS: finalMastery, AS: finalMastery },
    hp: finalHp,
    maxHp: finalHp,
    atk: finalAtk,
    idolPower: finalIdol,
    def: finalDef,
    mdef: finalMdef,
    maxBreak: finalBp,
    currentBreak: finalBp,
    aggro: finalAggro,
    reg: finalReg,
    accuracy: finalHit,
    evasion: finalDodge,
    critChance: finalCrit,
    speed: finalSpd,
    critDmg: finalCritDmg
  });
}

let isConfigStarting = false;
export function startBattleWithConfig(config = {}) {
  if (isConfigStarting) return;
  isConfigStarting = true;
  setTimeout(() => { isConfigStarting = false; }, 1200);

  window.isBattleActive = true;
  try {
    window.activeBattleContext = config;

    if (arenaTickTimer) {
      clearInterval(arenaTickTimer);
      arenaTickTimer = null;
    }

    isPaused = false;
    isBattleStarted = false;
    currentSpeed = 1;
    isManualTargeting = false;
    selectedHandCard = null;
    pendingCardSelection = null;
    damageStats = { TEAM_A: {}, TEAM_B: {} };

    updateSpeedButtonText();
    updatePlayPauseButton();

    const btnAutoResolve = document.getElementById('btn-arena-auto-resolve');
    if (btnAutoResolve) {
      btnAutoResolve.style.display = 'none';
      btnAutoResolve.disabled = false;
      btnAutoResolve.textContent = '⚡ 잔여 자동 전투 전환';
    }

    // 1. Build Player Team (TEAM_A) from current deck
    // 0. Condition <= 25 Check: cannot enter battle
    const deckIdx = window.getCurrentDeckIndex ? window.getCurrentDeckIndex() : 0;
    const currentDeck = (PlayerData.decks && PlayerData.decks[deckIdx]) || { strikers: [], supporters: [] };
    const allAssigned = [...(currentDeck.supporters || []), ...(currentDeck.strikers || [])].filter(Boolean);
    const tooTiredMembers = allAssigned.filter(cid => {
      const st = (PlayerData.characterStats && PlayerData.characterStats[cid]) || {};
      const cond = st.condition !== undefined ? st.condition : 100;
      return cond <= 25;
    });
    if (tooTiredMembers.length > 0) {
      alert("컨디션이 25 이하인 캐릭터가 편성되어 있어 출전할 수 없습니다.");
      return;
    }

    isAutoBattleActive = false;

    const allCharsData = GameData.characters || [];

    const charsA = [];
    // 5 Strikers (slots 1..5)
    for (let i = 0; i < 5; i++) {
      const charId = (currentDeck.strikers || [])[i];
      const char = allCharsData.find(c => c.Character_ID === charId);
      if (char) {
        const stats = (PlayerData.characterStats && PlayerData.characterStats[charId]) || {};
        charsA.push(buildPlayerBattleCharacter(char, stats, i + 1));
      }
    }
    // 3 Supporters (slots 6..8)
    for (let i = 0; i < 3; i++) {
      const charId = (currentDeck.supporters || [])[i];
      const char = allCharsData.find(c => c.Character_ID === charId);
      if (char) {
        const stats = (PlayerData.characterStats && PlayerData.characterStats[charId]) || {};
        charsA.push(buildPlayerBattleCharacter(char, stats, i + 6));
      }
    }

    // 2. Build Enemy Team (TEAM_B)
    const charsB = [];
    if (config.type === 'rehearsal' && config.stage) {
      const stage = config.stage;
      const stageLevel = parseInt(stage.Stage_Level) || 1;
      let starCount = 1;
      if (stageLevel >= 60) starCount = 3;
      else if (stageLevel >= 30) starCount = 2;
      const stageCore = parseInt(stage.Stage_Core) || 0;
      const stageMaster = parseInt(stage.Stage_Master || config.stageMaster) || 0;

      const rawChars = (stage.Stage_Characters || '').split(',').map(s => s.trim()).filter(Boolean);
      rawChars.forEach((cid, idx) => {
        const char = allCharsData.find(c => c.Character_ID === cid);
        if (char) {
          charsB.push(buildEnemyBattleCharacter(char, stageLevel, starCount, stageCore, idx + 1, stageMaster));
        }
      });
    } else if (config.type === 'live') {
      const baseLevel = config.baseLevel || 30;
      const starCount = config.starCount || (baseLevel >= 90 ? 3 : (baseLevel >= 60 ? 2 : 1));
      const stageCore = config.stageCore || 0;
      const stageMaster = parseInt(config.stageMaster) || 0;
      const enemyIds = config.enemyIds || [];

      enemyIds.forEach((cid, idx) => {
        if (cid) {
          const char = allCharsData.find(c => c.Character_ID === cid);
          if (char) {
            charsB.push(buildEnemyBattleCharacter(char, baseLevel, starCount, stageCore, idx + 1, stageMaster));
          }
        }
      });
    } else {
      // Fallback or Test Battle
      return startFreshBattle(false);
    }

    if (charsA.length === 0 || charsB.length === 0) {
      alert("전투 팀 구성 데이터를 불러오지 못했습니다.");
      return;
    }

    const allChars = [...charsA, ...charsB];
    const { skillsMasterMap, keywordsMasterMap } = buildMasterMaps(allChars);

    const teamA = createTeamState('TEAM_A', true, charsA);
    const teamB = createTeamState('TEAM_B', false, charsB);

    // Apply issue modifiers to teams
    applyIssuesToBattle({
      teamA,
      teamB,
      issueIds: config.activeIssues || [],
      GameData
    });

    // Track damage stats
    allChars.forEach(c => {
      damageStats[c.teamId][c.characterId] = {
        name: c.name,
        characterType: c.characterType,
        mainRole: c.mainRole,
        level: c.level || 1,
        star: c.star || 1,
        raw: c.raw,
        damageDealt: 0,
        damageTaken: 0,
        shieldGiven: 0,
        healingDone: 0,
        evasionCount: 0,
        cardsUsed: 0,
        overheatTotal: 0,
        ultCount: 0,
        killCount: 0,
        critCount: 0
      };
    });

    activeArenaEngine = new BattleEngine(teamA, teamB, {
      seed: Math.floor(Math.random() * 1000000),
      skillsMasterMap,
      keywordsMasterMap,
      manualPlayerPass: true
    });
    window.activeArenaEngine = activeArenaEngine;

    bindEngineEvents(activeArenaEngine);
    activeArenaEngine.initBattle();

    // 1. Issue Fatigue Cards (Issue_013, Issue_014, Issue_015 - 강행군)
    const issueFatigueCount = teamA.fatigueCardsCount || 0;
    for (let i = 0; i < issueFatigueCount; i++) {
      teamA.deck.push(createTiredCard('SYSTEM'));
    }

    // 2. Condition <= 50 check: Add 1 '지쳐감' (B_S_014) card per member with condition <= 50 to teamA.deck
    const tiredMembers = teamA.characters.filter(c => {
      const st = (PlayerData.characterStats && PlayerData.characterStats[c.characterId]) || {};
      const cond = st.condition !== undefined ? st.condition : 100;
      return cond <= 50;
    });
    if (tiredMembers.length > 0) {
      tiredMembers.forEach(tm => {
        const tiredCard = createTiredCard(tm.characterId);
        teamA.deck.push(tiredCard);
      });
    }

    if (issueFatigueCount > 0 || tiredMembers.length > 0) {
      teamA.deck = shuffleCards(teamA.deck, activeArenaEngine.rng);
    }

    preloadBattleCutsceneImages(teamA, teamB);

    // Transition to battle scene
    const battleScene = document.getElementById('scene-battle');
    const currentScene = document.querySelector('.scene.active');
    if (battleScene && currentScene && currentScene !== battleScene) {
      if (typeof window.changeSceneWipe === 'function') {
        window.changeSceneWipe(currentScene, battleScene);
      } else {
        currentScene.classList.remove('active');
        battleScene.classList.add('active');
      }
    }

    const btnStart = document.getElementById('btn-arena-start');
    if (btnStart) {
      btnStart.style.display = 'none'; // Hidden in normal battle
    }

    updateStepButtonState();

    // Ensure global time system runs continuously so AP, Studio, and Office tick during battle
    if (typeof window.startGlobalTimeSystem === 'function') {
      window.startGlobalTimeSystem();
    }

    // Play battle BGM according to deck configuration
    playBattleBgm();

    renderBattleArena();

    // Automatically begin battle in normal mode
    beginBattle();
  } catch (err) {
    console.error("startBattleWithConfig failed:", err);
    alert("전투 시작 중 오류가 발생했습니다: " + err.message);
  }
}

window.startBattleWithConfig = startBattleWithConfig;

/**
 * Opens Type Advantage Modal (속성 상성표)
 */
export function openTypeAdvantageModal() {
  let modal = document.getElementById('arena-type-chart-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'arena-type-chart-modal';
    modal.className = 'arena-type-modal-backdrop';
    modal.innerHTML = `
      <div class="arena-type-modal-card">
        <div class="arena-type-modal-header">
          <div class="modal-title-box">
            <img src="${ATTR_ICONS['청초']}" alt="속성" class="modal-header-attr-ico">
            <div>
              <h2 class="modal-title">속성 상성 관계표</h2>
              <div class="modal-subtitle">5대 순환 상성 및 광기 / 에로 상호 우위 체계</div>
            </div>
          </div>
          <button id="btn-close-type-chart" class="modal-close-btn" type="button" aria-label="닫기">&times;</button>
        </div>

        <div class="arena-type-modal-body">
          <!-- 1. 상성 우위 효과 안내 배너 -->
          <div class="type-benefit-banner">
            <div class="benefit-badge">상성 우위 효과</div>
            <div class="benefit-text">
              우위 속성으로 적 공격 시 주는 피해량이 <b>1.5배(150%)</b>로 증가하며 대상의 <b>브레이크(BP)를 1 추가 차감</b>합니다.
            </div>
          </div>

          <!-- 2. 5대 기본 속성 순환 상성 (청초 → 게닌 → 쿨 → 아티스트 → 큐트 → 청초) -->
          <div class="type-cycle-section">
            <div class="section-title">
              <span>5대 기본 속성 순환 상성</span>
              <span class="section-badge">순환 관계 (우세 → 열세)</span>
            </div>
            <div class="type-cycle-track">
              <div class="type-card-node" style="--node-color:#38bdf8;">
                <div class="node-icon-box"><img src="${ATTR_ICONS['청초']}" alt="청초" class="type-node-icon"></div>
                <div class="node-info">
                  <span class="node-name" style="color:#38bdf8;">청초</span>
                  <span class="node-target">우위: <img src="${ATTR_ICONS['게닌']}" class="mini-attr-ico" alt="게닌"> 게닌</span>
                </div>
              </div>
              <div class="track-arrow">→</div>
              <div class="type-card-node" style="--node-color:#f97316;">
                <div class="node-icon-box"><img src="${ATTR_ICONS['게닌']}" alt="게닌" class="type-node-icon"></div>
                <div class="node-info">
                  <span class="node-name" style="color:#f97316;">게닌</span>
                  <span class="node-target">우위: <img src="${ATTR_ICONS['쿨']}" class="mini-attr-ico" alt="쿨"> 쿨</span>
                </div>
              </div>
              <div class="track-arrow">→</div>
              <div class="type-card-node" style="--node-color:#3b82f6;">
                <div class="node-icon-box"><img src="${ATTR_ICONS['쿨']}" alt="쿨" class="type-node-icon"></div>
                <div class="node-info">
                  <span class="node-name" style="color:#3b82f6;">쿨</span>
                  <span class="node-target">우위: <img src="${ATTR_ICONS['아티스트']}" class="mini-attr-ico" alt="아티스트"> 아티스트</span>
                </div>
              </div>
              <div class="track-arrow">→</div>
              <div class="type-card-node" style="--node-color:#a855f7;">
                <div class="node-icon-box"><img src="${ATTR_ICONS['아티스트']}" alt="아티스트" class="type-node-icon"></div>
                <div class="node-info">
                  <span class="node-name" style="color:#a855f7;">아티스트</span>
                  <span class="node-target">우위: <img src="${ATTR_ICONS['큐트']}" class="mini-attr-ico" alt="큐트"> 큐트</span>
                </div>
              </div>
              <div class="track-arrow">→</div>
              <div class="type-card-node" style="--node-color:#ec4899;">
                <div class="node-icon-box"><img src="${ATTR_ICONS['큐트']}" alt="큐트" class="type-node-icon"></div>
                <div class="node-info">
                  <span class="node-name" style="color:#ec4899;">큐트</span>
                  <span class="node-target">우위: <img src="${ATTR_ICONS['청초']}" class="mini-attr-ico" alt="청초"> 청초</span>
                </div>
              </div>
              <div class="track-arrow">→</div>
              <div class="type-card-node" style="--node-color:#38bdf8;">
                <div class="node-icon-box"><img src="${ATTR_ICONS['청초']}" alt="청초" class="type-node-icon"></div>
                <div class="node-info">
                  <span class="node-name" style="color:#38bdf8;">청초</span>
                  <span class="node-target">순환 완료</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 3. 특수 상호 상성 (광기 ⇄ 에로) -->
          <div class="type-mutual-section">
            <div class="section-title">
              <span>특수 상호 상성</span>
              <span class="section-badge mutual-badge">상호 우위 대결</span>
            </div>
            <div class="type-mutual-clash-box">
              <div class="type-clash-card" style="--node-color:#ef4444;">
                <img src="${ATTR_ICONS['광기']}" alt="광기" class="type-clash-icon">
                <div class="clash-info">
                  <span class="clash-name" style="color:#ef4444;">광기</span>
                  <span class="clash-desc">에로에 우위 (1.5배 피해 + BP 1 차감)</span>
                </div>
              </div>
              <div class="clash-center-effect">
                <div class="clash-arrow-sign">⇄</div>
                <span class="clash-center-text">상호 우위 대결</span>
              </div>
              <div class="type-clash-card" style="--node-color:#f43f5e;">
                <img src="${ATTR_ICONS['에로']}" alt="에로" class="type-clash-icon">
                <div class="clash-info">
                  <span class="clash-name" style="color:#f43f5e;">에로</span>
                  <span class="clash-desc">광기에 우위 (1.5배 피해 + BP 1 차감)</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeTypeAdvantageModal();
    });

    const closeBtn = modal.querySelector('#btn-close-type-chart');
    if (closeBtn) {
      closeBtn.addEventListener('click', closeTypeAdvantageModal);
    }
  }

  modal.classList.add('modal-active');
}

export function closeTypeAdvantageModal() {
  const modal = document.getElementById('arena-type-chart-modal');
  if (modal) {
    modal.classList.remove('modal-active');
  }
}

// =========================================
// Battle BGM Management
// =========================================
let currentBattleSongId = null;

export function playBattleBgm() {
  window.isBattleActive = true;

  const bgmMain = document.getElementById('bgm-main');
  if (bgmMain) {
    try {
      bgmMain.pause();
      bgmMain.currentTime = 0;
    } catch (e) {}
  }

  const bgmLogin = document.getElementById('bgm-login');
  if (bgmLogin) {
    try {
      bgmLogin.pause();
      bgmLogin.currentTime = 0;
    } catch (e) {}
  }

  const bgmBattle = document.getElementById('bgm-battle');
  if (!bgmBattle) return;

  try {
    bgmBattle.onended = null;
    bgmBattle.pause();
    bgmBattle.currentTime = 0;
  } catch (e) {}

  const deck = PlayerData.decks ? PlayerData.decks[window.getCurrentDeckIndex ? window.getCurrentDeckIndex() : 0] : null;
  const chosenBgm = deck ? deck.bgm : 'random';

  // Helper to get pool of eligible songs with valid link
  const getSongPool = () => {
    const allSongs = GameData.songs || [];
    const ownedIds = PlayerData.songs || [];
    let pool = allSongs.filter(s => ownedIds.includes(s.Song_ID) && s.Song_Link);
    if (pool.length === 0) {
      pool = allSongs.filter(s => s.Song_Link);
    }
    return pool;
  };

  // True random song picker (unpredictable)
  const getRandomSong = (excludeId = null) => {
    const pool = getSongPool();
    if (pool.length === 0) return null;
    let candidates = pool;
    if (pool.length > 1 && excludeId) {
      candidates = pool.filter(s => s.Song_ID !== excludeId);
      if (candidates.length === 0) candidates = pool;
    }
    let randIndex;
    if (window.crypto && window.crypto.getRandomValues) {
      const arr = new Uint32Array(1);
      window.crypto.getRandomValues(arr);
      randIndex = arr[0] % candidates.length;
    } else {
      randIndex = Math.floor(Math.random() * candidates.length);
    }
    return candidates[randIndex];
  };

  const playSong = (songInfo, isLoop) => {
    if (!songInfo || !songInfo.Song_Link) return;
    if (!window.isBattleActive) return; // 전투가 이미 종료되었으면 재생 중단

    currentBattleSongId = songInfo.Song_ID;
    bgmBattle.src = songInfo.Song_Link;
    bgmBattle.loop = isLoop;

    // Update arena top hud BGM title & mute icon
    const arenaBgmTitle = document.getElementById('arena-bgm-title');
    if (arenaBgmTitle) {
      arenaBgmTitle.textContent = `🎵 ${songInfo.Song_Name || '전투 BGM'}`;
      arenaBgmTitle.title = songInfo.Song_Name || '전투 BGM';
    }
    const arenaMuteBtn = document.getElementById('btn-arena-mute-bgm');
    if (arenaMuteBtn) {
      arenaMuteBtn.textContent = PlayerData.options?.muteBgm ? '🔇' : '🔊';
    }
    
    // Apply sound settings volume (기본 70% 축소 적용)
    let finalBgmVol = 0.5;
    if (PlayerData.settings && PlayerData.settings.sound) {
      const master = (PlayerData.settings.sound.master ?? 100) / 100;
      const bgm = (PlayerData.settings.sound.bgm ?? 70) / 100;
      finalBgmVol = master * bgm;
    } else if (PlayerData.options) {
      const master = (PlayerData.options.volMaster ?? 100) / 100;
      const bgm = (PlayerData.options.volBgm ?? 70) / 100;
      finalBgmVol = master * bgm;
    }
    if (PlayerData.options?.muteBgm) {
      finalBgmVol = 0;
    }
    finalBgmVol *= 0.7; // 모든 BGM 기본 70%로 축소
    bgmBattle.volume = Math.max(0, Math.min(1, finalBgmVol));
    
    bgmBattle.play().catch(e => console.log('전투 BGM 재생 안내:', e));
  };

  bgmBattle.onended = null;

  if (chosenBgm === 'random') {
    const song = getRandomSong(null);
    if (song) {
      playSong(song, false);
      bgmBattle.onended = () => {
        if (!window.isBattleActive) return;
        const battleScene = document.getElementById('scene-battle');
        if (!battleScene || !battleScene.classList.contains('active')) return;

        // Upon finish, transition to another random song
        const nextSong = getRandomSong(currentBattleSongId);
        if (nextSong) {
          playSong(nextSong, false);
        }
      };
    }
  } else {
    // Specific song: repeat on loop
    const songInfo = GameData.songs ? GameData.songs.find(s => s.Song_ID === chosenBgm) : null;
    if (songInfo && songInfo.Song_Link) {
      playSong(songInfo, true);
    } else {
      const song = getRandomSong(null);
      if (song) playSong(song, true);
    }
  }
}

export function stopBattleBgm() {
  window.isBattleActive = false;
  const bgmBattle = document.getElementById('bgm-battle');
  if (bgmBattle) {
    bgmBattle.onended = null;
    try {
      bgmBattle.pause();
      bgmBattle.currentTime = 0;
      bgmBattle.src = '';
    } catch (e) {}
  }
  currentBattleSongId = null;
  const arenaBgmTitle = document.getElementById('arena-bgm-title');
  if (arenaBgmTitle) {
    arenaBgmTitle.textContent = '🎵 BGM 대기 중';
    arenaBgmTitle.title = 'BGM 대기 중';
  }

  // Resume main BGM if not in login or battle
  const loginScene = document.getElementById('login-scene');
  const battleScene = document.getElementById('scene-battle');
  if ((!loginScene || !loginScene.classList.contains('active')) &&
      (!battleScene || !battleScene.classList.contains('active')) &&
      !window.isBattleActive) {
    const bgmMain = document.getElementById('bgm-main');
    if (bgmMain && bgmMain.paused) {
      bgmMain.play().catch(() => {});
    }
  }
}

window.playBattleBgm = playBattleBgm;
window.stopBattleBgm = stopBattleBgm;

/**
 * Battle 11: Play Skill Sound Effects with sequential playback and priority rules
 * - If comma-separated audio files, play sequentially at 0.25s intervals
 * - Total duration capped at 2.5s with linear volume fade-out from 2.0s to 2.5s
 * - 'B_S_002', 'B_S_003', 'B_S_483' and counter attacks prioritize CS_Skill_Sound
 */
export function playSkillSoundWithRules(cardOrSkill, casterChar, isCounter = false) {
  try {
    let skillObj = cardOrSkill?.skillData || cardOrSkill?.rawSkill || cardOrSkill || null;
    const skillId = skillObj?.Skill_ID || cardOrSkill?.skillId || '';

    const allSkills = window.GameData?.skills || window.GameData?.skill || [];
    if (!skillObj && skillId && allSkills.length > 0) {
      skillObj = allSkills.find(s => s.Skill_ID === skillId) || null;
    }

    const specialIds = ['B_S_002', 'B_S_003', 'B_S_483'];
    const preferCsSound = isCounter || specialIds.includes(skillId);

    let soundStr = '';
    if (preferCsSound) {
      soundStr = casterChar?.CS_Skill_Sound || casterChar?.raw?.CS_Skill_Sound || casterChar?.rawChar?.CS_Skill_Sound || skillObj?.CS_Skill_Sound || '';
      if (!soundStr && skillObj) {
        soundStr = skillObj.Skill_Sound || '';
      }
    } else {
      soundStr = skillObj?.Skill_Sound || '';
      if (!soundStr && specialIds.includes(skillId)) {
        soundStr = casterChar?.CS_Skill_Sound || casterChar?.raw?.CS_Skill_Sound || skillObj?.CS_Skill_Sound || '';
      }
    }

    if (!soundStr && casterChar) {
      soundStr = preferCsSound
        ? (casterChar.CS_Skill_Sound || casterChar.raw?.CS_Skill_Sound || casterChar.Skill_Sound || casterChar.raw?.Skill_Sound || '')
        : (casterChar.Skill_Sound || casterChar.raw?.Skill_Sound || '');
    }

    if (!soundStr || typeof soundStr !== 'string') return;

    // Helper to resolve Asset_ID (e.g. 'asset_042') or Asset_Name to full audio URL
    const resolveAudioUrl = (token) => {
      if (!token || typeof token !== 'string') return null;
      const t = token.trim();
      if (!t) return null;
      if (t.startsWith('http://') || t.startsWith('https://') || t.startsWith('/') || t.startsWith('./') || t.endsWith('.mp3') || t.endsWith('.wav') || t.endsWith('.ogg')) {
        return t;
      }
      const assets = window.GameData?.assets || [];
      const found = assets.find(a =>
        a.Asset_ID === t ||
        a.Asset_Name === t ||
        (a.Asset_ID && a.Asset_ID.toLowerCase() === t.toLowerCase()) ||
        (a.Asset_Name && a.Asset_Name.toLowerCase() === t.toLowerCase())
      );
      if (found && found.Asset_Link) {
        return found.Asset_Link;
      }
      return t;
    };

    const rawTokens = soundStr.split(',').map(s => s.trim()).filter(Boolean);
    const soundUrls = rawTokens.map(resolveAudioUrl).filter(Boolean);
    if (soundUrls.length === 0) return;

    let baseVol = 0.5;
    if (window.PlayerData?.settings?.sound) {
      const master = (window.PlayerData.settings.sound.master ?? 100) / 100;
      const sfx = (window.PlayerData.settings.sound.sfx ?? window.PlayerData.settings.sound.se ?? 100) / 100;
      baseVol = Math.max(0, Math.min(1, master * sfx));
    }
    if (baseVol <= 0) return;

    const activeAudios = [];
    soundUrls.forEach((url, idx) => {
      const delayMs = idx * 250;
      if (delayMs >= 2500) return; // Exceeds 2.5s maximum playback window
      setTimeout(() => {
        try {
          const audio = new Audio(url);
          audio.volume = baseVol;
          activeAudios.push(audio);
          audio.play().catch(e => console.log('[Skill Sound] Play notice:', e));
        } catch (err) {
          console.warn('[Skill Sound] Audio instance error:', err);
        }
      }, delayMs);
    });

    // Fade-out from 2.0s to 2.5s (step every 50ms)
    const fadeStartTime = 2000;
    const fadeDuration = 500;
    const fadeSteps = 10;
    const stepInterval = fadeDuration / fadeSteps; // 50ms

    setTimeout(() => {
      let step = 0;
      const fadeTimer = setInterval(() => {
        step++;
        const factor = Math.max(0, 1 - (step / fadeSteps));
        activeAudios.forEach(audio => {
          try {
            audio.volume = Math.max(0, baseVol * factor);
          } catch (e) {}
        });
        if (step >= fadeSteps) {
          clearInterval(fadeTimer);
          activeAudios.forEach(audio => {
            try {
              audio.pause();
              audio.currentTime = 0;
            } catch (e) {}
          });
          activeAudios.length = 0;
        }
      }, stepInterval);
    }, fadeStartTime);
  } catch (err) {
    console.error('[Skill Sound System Error]:', err);
  }
}

window.playSkillSoundWithRules = playSkillSoundWithRules;

// ============================================================================
// Asset Sound System (SFX playback with asset ID / URL fallback)
// ============================================================================

export const SYSTEM_ASSET_SOUNDS = {
  'asset_018': 'https://github.com/nahan5694/holtochess3/raw/refs/heads/main/Sound/%ED%81%B4%EB%A6%AD%EC%83%81%ED%98%B8%EC%9E%91%EC%9A%A9.wav',
  'asset_019': 'https://github.com/nahan5694/holtochess3/raw/refs/heads/main/Sound/%EB%A0%88%EB%B2%A8%EC%97%85.mp3',
  'asset_020': 'https://github.com/nahan5694/holtochess3/raw/refs/heads/main/Sound/%EB%8D%B1%EC%85%94%ED%94%8C.wav',
  'asset_021': 'https://github.com/nahan5694/holtochess3/raw/refs/heads/main/Sound/%ED%9A%8C%ED%94%BC.mp3',
  '클릭상호작용': 'https://github.com/nahan5694/holtochess3/raw/refs/heads/main/Sound/%ED%81%B4%EB%A6%AD%EC%83%81%ED%98%B8%EC%9E%91%EC%9A%A9.wav',
  '레벨업': 'https://github.com/nahan5694/holtochess3/raw/refs/heads/main/Sound/%EB%A0%88%EB%B2%A8%EC%97%85.mp3',
  '덱셔플': 'https://github.com/nahan5694/holtochess3/raw/refs/heads/main/Sound/%EB%8D%B1%EC%85%94%ED%94%8C.wav',
  '회피': 'https://github.com/nahan5694/holtochess3/raw/refs/heads/main/Sound/%ED%9A%8C%ED%94%BC.mp3'
};

export function playAssetSound(assetId, volMult = 1.0) {
  try {
    if (!assetId) return;
    let url = '';
    if (window.GameData && Array.isArray(window.GameData.assets)) {
      const found = window.GameData.assets.find(a =>
        a.Asset_ID === assetId ||
        a.Asset_Name === assetId ||
        String(a.Asset_ID || '').toLowerCase() === String(assetId).toLowerCase()
      );
      if (found && found.Asset_Link) {
        url = found.Asset_Link;
      }
    }
    if (!url && SYSTEM_ASSET_SOUNDS[assetId]) {
      url = SYSTEM_ASSET_SOUNDS[assetId];
    }
    if (!url && typeof assetId === 'string' && (assetId.startsWith('http') || assetId.endsWith('.mp3') || assetId.endsWith('.wav'))) {
      url = assetId;
    }
    if (!url) return;

    // Check mute
    const isMuteMaster = window.PlayerData?.options?.muteMaster;
    const isMuteSfx = window.PlayerData?.options?.muteSfx;
    if (isMuteMaster || isMuteSfx) return;

    const master = (window.PlayerData?.settings?.sound?.master ?? window.PlayerData?.options?.volMaster ?? 100) / 100;
    const sfx = (window.PlayerData?.settings?.sound?.sfx ?? window.PlayerData?.settings?.sound?.se ?? window.PlayerData?.options?.volSfx ?? 100) / 100;
    const baseVol = Math.max(0, Math.min(1, master * sfx * volMult));
    if (baseVol <= 0) return;

    const audio = new Audio(url);
    audio.volume = baseVol;
    audio.play().catch(e => console.log(`[Asset Sound ${assetId}] Play notice:`, e));
  } catch (err) {
    console.warn(`[Asset Sound System Error ${assetId}]:`, err);
  }
}

window.playAssetSound = playAssetSound;

// ============================================================================
// Battle Deck Inspection & Card Zoom Modal
// ============================================================================

let activeDeckTab = 'draw'; // 'draw' or 'discard'
let activeDeckTeam = 'player'; // 'player' or 'enemy'

export function updateDeckHudCounts() {
  const drawCountEl = document.getElementById('arena-deck-draw-count');
  const discardCountEl = document.getElementById('arena-deck-discard-count');
  if (!activeArenaEngine) {
    if (drawCountEl) drawCountEl.textContent = '0';
    if (discardCountEl) discardCountEl.textContent = '0';
    return;
  }
  const drawLen = activeArenaEngine.teamA?.deck?.length ?? 0;
  const discardLen = activeArenaEngine.teamA?.discard?.length ?? 0;
  if (drawCountEl) drawCountEl.textContent = String(drawLen);
  if (discardCountEl) discardCountEl.textContent = String(discardLen);
}

export function openArenaDeckModal(tab = 'draw', team = 'player') {
  activeDeckTab = tab;
  activeDeckTeam = team;
  const modal = document.getElementById('arena-deck-modal');
  if (!modal) return;
  modal.style.display = 'flex';
  window.isDeckModalOpen = true;
  renderArenaDeckModal();
}

export function closeArenaDeckModal() {
  const modal = document.getElementById('arena-deck-modal');
  if (modal) modal.style.display = 'none';
  window.isDeckModalOpen = false;
}

export function renderArenaDeckModal() {
  if (!activeArenaEngine) return;
  const modal = document.getElementById('arena-deck-modal');
  if (!modal || modal.style.display === 'none') return;

  const targetTeam = activeDeckTeam === 'player' ? activeArenaEngine.teamA : activeArenaEngine.teamB;
  const cardList = activeDeckTab === 'draw' ? (targetTeam?.deck || []) : (targetTeam?.discard || []);

  // Update tabs UI
  const btnDrawTab = document.getElementById('btn-deck-tab-draw');
  const btnDiscardTab = document.getElementById('btn-deck-tab-discard');
  const btnPlayerTeam = document.getElementById('btn-deck-team-player');
  const btnEnemyTeam = document.getElementById('btn-deck-team-enemy');

  if (btnDrawTab) btnDrawTab.classList.toggle('active', activeDeckTab === 'draw');
  if (btnDiscardTab) btnDiscardTab.classList.toggle('active', activeDeckTab === 'discard');
  if (btnPlayerTeam) btnPlayerTeam.classList.toggle('active', activeDeckTeam === 'player');
  if (btnEnemyTeam) btnEnemyTeam.classList.toggle('active', activeDeckTeam === 'enemy');

  // Update Title & Badge
  const titleEl = document.getElementById('arena-deck-modal-title');
  const iconEl = document.getElementById('arena-deck-modal-icon');
  const badgeEl = document.getElementById('arena-deck-modal-count');

  const teamName = activeDeckTeam === 'player' ? '아군' : '적군';
  const tabName = activeDeckTab === 'draw' ? '뽑을 카드 덱' : '버려진 카드 덱';
  if (titleEl) titleEl.textContent = `${teamName} ${tabName}`;
  if (iconEl) iconEl.textContent = activeDeckTab === 'draw' ? '🎴' : '🗑️';
  if (badgeEl) badgeEl.textContent = `${cardList.length}장`;

  const grid = document.getElementById('arena-deck-card-grid');
  if (!grid) return;

  if (cardList.length === 0) {
    grid.innerHTML = `
      <div class="deck-empty-message">
        ${activeDeckTab === 'draw' ? '🎴 덱에 남은 카드가 없습니다.' : '🗑️ 버려진 카드가 없습니다.'}
      </div>
    `;
    return;
  }

  // Requirement 9: Shuffle display cards for draw pile so draw sequence cannot be card-counted
  const displayCards = activeDeckTab === 'draw' ? [...cardList].sort(() => Math.random() - 0.5) : [...cardList];

  grid.innerHTML = displayCards.map((card, idx) => {
    const owner = activeArenaEngine.getCharacterById(card.ownerCharacterId);
    const rawOwner = owner?.raw || {};
    const portrait = rawOwner.Character_Image_Long || rawOwner.Character_Image_Full || rawOwner.Character_Image || rawOwner.Character_Portrait || '';
    const skillData = card.skillData || card.rawSkill || {};
    const skillName = card.skillName || skillData.Skill_Name || card.skillId || '스킬';
    const overheat = card.overheatCost !== undefined ? card.overheatCost : getCardOverheat(card, owner);

    let ohBadge = `OH +${overheat}`;
    let ohClass = 'oh-cost-hot';
    if (overheat < 0) {
      ohBadge = `OH -${Math.abs(overheat)}`;
      ohClass = 'oh-cost-cool';
    } else if (overheat === 0) {
      ohBadge = 'OH 0';
      ohClass = 'oh-cost-zero';
    }

    let tierColor = '#3b82f6';
    let typeName = '기본기';
    let typeGradient = 'linear-gradient(135deg, #1e3a8a, #3b82f6)';
    if (card.cardType === CardType.ULTIMATE) {
      tierColor = '#f59e0b';
      typeName = '궁극기';
      typeGradient = 'linear-gradient(135deg, #78350f, #f59e0b)';
    } else if (card.cardType === CardType.UNIQUE) {
      tierColor = '#a855f7';
      typeName = '고유기';
      typeGradient = 'linear-gradient(135deg, #4c1d95, #8b5cf6)';
    } else if (card.cardType === CardType.MEMORIAL) {
      tierColor = '#ef4444';
      typeName = '추모 카드';
      typeGradient = 'linear-gradient(135deg, #18181b, #7f1d1d)';
    } else if (card.cardType === CardType.CURSE || card.skillId === 'B_S_014') {
      tierColor = '#a855f7';
      typeName = '저주 카드';
      typeGradient = 'linear-gradient(135deg, #18181b, #581c87)';
    }

    const catInfo = getSkillCategoryBadge(skillData, card);
    const ownerName = owner ? owner.name : (card.cardType === CardType.MEMORIAL ? '추모' : '홀로멤');

    return `
      <div class="deck-thumbnail-card" data-card-idx="${idx}" style="--tier-color: ${tierColor};">
        <div class="deck-thumb-header" style="background: ${typeGradient};">
          <span class="deck-thumb-tier">${typeName}</span>
          <span class="deck-thumb-oh ${ohClass}">${ohBadge}</span>
        </div>
        <div class="deck-thumb-art">
          ${portrait ? `<img src="${portrait}" alt="${ownerName}">` : `<div class="art-fallback">${ownerName}</div>`}
          <div class="deck-thumb-owner">${ownerName}</div>
        </div>
        <div class="deck-thumb-info">
          <div class="deck-thumb-skill-name">${skillName}</div>
          <div class="deck-thumb-meta">
            <span class="deck-thumb-cat" style="background: ${catInfo.color};">${catInfo.label}</span>
            ${catInfo.isQuick ? `<span class="deck-thumb-quick">⚡ 속공</span>` : ''}
          </div>
          <div class="deck-thumb-desc">${getSkillDescription(skillData, card)}</div>
        </div>
        <div class="deck-thumb-zoom-hint">🔍 클릭하여 확대</div>
      </div>
    `;
  }).join('');

  // Attach zoom click handlers
  grid.querySelectorAll('.deck-thumbnail-card').forEach((el, idx) => {
    el.addEventListener('click', () => {
      const card = displayCards[idx];
      const owner = activeArenaEngine.getCharacterById(card.ownerCharacterId);
      openCardZoomModal(card, owner);
    });
  });
}

window.refreshArenaDeckModal = renderArenaDeckModal;

export function openCardZoomModal(card, owner) {
  if (!card) return;
  const modal = document.getElementById('arena-card-zoom-modal');
  const target = document.getElementById('arena-card-zoom-target');
  if (!modal || !target) return;

  const rawOwner = owner?.raw || {};
  const portraitLong = rawOwner.Character_Image_Long || rawOwner.Character_Image_Full || rawOwner.Character_Image || rawOwner.Character_Portrait || '';
  const skillData = card.skillData || card.rawSkill || {};
  const skillName = card.skillName || skillData.Skill_Name || card.skillId || '스킬';
  const overheat = card.overheatCost !== undefined ? card.overheatCost : getCardOverheat(card, owner);

  let ohBadge = `OH +${overheat}`;
  let ohClass = 'oh-cost-hot';
  if (overheat < 0) {
    ohBadge = `OH -${Math.abs(overheat)}`;
    ohClass = 'oh-cost-cool';
  } else if (overheat === 0) {
    ohBadge = 'OH 0';
    ohClass = 'oh-cost-zero';
  }

  let tierColor = '#3b82f6';
  let typeName = '기본기';
  let typeGradient = 'linear-gradient(135deg, #1e3a8a, #3b82f6)';
  if (card.cardType === CardType.ULTIMATE) {
    tierColor = '#f59e0b';
    typeName = '궁극기';
    typeGradient = 'linear-gradient(135deg, #78350f, #f59e0b)';
  } else if (card.cardType === CardType.UNIQUE) {
    tierColor = '#a855f7';
    typeName = '고유기';
    typeGradient = 'linear-gradient(135deg, #4c1d95, #8b5cf6)';
  } else if (card.cardType === CardType.MEMORIAL) {
    tierColor = '#ef4444';
    typeName = '추모 카드';
    typeGradient = 'linear-gradient(135deg, #18181b, #7f1d1d)';
  } else if (card.cardType === CardType.CURSE || card.skillId === 'B_S_014') {
    tierColor = '#a855f7';
    typeName = '저주 카드';
    typeGradient = 'linear-gradient(135deg, #18181b, #581c87)';
  }

  const catInfo = getSkillCategoryBadge(skillData, card);
  const ownerAttr = owner?.characterType || rawOwner.Character_Type || '청초';
  const ownerAttrIcon = ATTR_ICONS[ownerAttr] || '';
  const scopeHtml = renderGridScopeHtml(card);
  const ownerName = owner ? owner.name : (card.cardType === CardType.MEMORIAL ? '전체 아군' : '홀로멤');

  target.innerHTML = `
    <div class="arena-hand-card zoom-enlarged-card" style="--tier-color: ${tierColor};">
      <div class="hand-card-art-frame">
        <div class="hand-card-tier-badge" style="background: ${typeGradient};">${typeName}</div>
        ${portraitLong ? `
          <img class="hand-card-art-img" src="${portraitLong}" alt="${ownerName}">
        ` : `
          <div class="hand-card-art-placeholder">${ownerName}</div>
        `}
        <div class="hand-card-owner-tag">
          ${ownerAttrIcon ? `<img src="${ownerAttrIcon}" class="hand-card-attr-icon" alt="${ownerAttr}">` : ''}
          <div class="owner-text-wrap">
            <span class="owner-name">${ownerName}</span>
            <span class="owner-role">${owner ? owner.mainRole : ''}</span>
          </div>
        </div>
      </div>
      <div class="hand-card-body">
        <div class="hand-card-meta-bar">
          <span class="hand-card-cat-badge" style="background: ${catInfo.color};">${catInfo.label}</span>
          ${catInfo.isQuick ? `<span class="hand-card-quick-badge">⚡ 속공</span>` : ''}
        </div>
        <div class="hand-skill-header-row">
          <div class="hand-skill-name">${skillName}</div>
          <span class="hand-card-oh-pill ${ohClass}">${ohBadge}</span>
        </div>
        <div class="hand-card-scope-box">
          ${scopeHtml}
        </div>
        <div class="hand-skill-desc">
          ${getSkillDescription(skillData, card)}
        </div>
      </div>
      <div class="zoom-close-hint">화면 아무 곳이나 클릭하면 닫힙니다.</div>
    </div>
  `;

  modal.style.display = 'flex';
}

export function closeCardZoomModal() {
  const modal = document.getElementById('arena-card-zoom-modal');
  if (modal) modal.style.display = 'none';
}
