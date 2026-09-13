import { GameData, PlayerData } from './state.js?v=004276';
import { updateTopCurrencies, showMessage } from './ui.js?v=004276';

// === Core System Balance Data ===
export const CORE_BALANCE = {
    // 코어밸류 (경험치)
    VALUE_PER_TIER: {
        1: 1,
        2: 3,
        3: 10,
        4: 50 // 분해 시
    },
    // 새로고침 확률 가중치
    REROLL_WEIGHTS: {
        T3_TO_T4: 0.1, // T3 새로고침 시 T4가 뜰 확률 (10%)
        T3_TO_T3: 0.9  // T3 새로고침 시 T3가 뜰 확률 (90%)
    },
    // 종형 분포를 위한 주사위 횟수 (중앙값 근처 확률 높임)
    BELL_CURVE_ROLLS: 3,
    // 새로고침 비용 (코어조각 개수)
    REROLL_COST: 5
};

// 속성별 요구 파편 아이템 매핑
export const CORE_ELEMENT_MAP = {
    '청초': 'Item_011',
    '게닌': 'Item_012',
    '쿨': 'Item_013',
    '아티스트': 'Item_014',
    '큐트': 'Item_015',
    '광기': 'Item_016',
    '에로': 'Item_017'
};

const CORE_FRAGMENT_ID = 'Item_010';
const CORE_CRAFT_COST_CREDIT = 1000;
const CORE_CRAFT_COST_FRAGMENT = 5;
const CORE_CRAFT_COST_ELEMENT = 1;


/**
 * UUID 생성기
 */
function generateCoreUID() {
    return 'core_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

/**
 * 신규 코어 제작
 */
export function getBellCurveRandom(min, max) {
    let u = 0, v = 0;
    while(u === 0) u = Math.random(); // Converting [0,1) to (0,1)
    while(v === 0) v = Math.random();
    let num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    
    num = num / 10.0 + 0.5; // Translate to 0 -> 1
    if (num > 1 || num < 0) num = getBellCurveRandom(min, max); // resample between 0 and 1
    
    return Math.floor(num * (max - min + 1)) + min;
}

export function createCore(element) {
    const elementItemId = CORE_ELEMENT_MAP[element];
    if (!elementItemId) {
        showMessage("잘못된 속성입니다.");
        return null;
    }

    const currentCredit = Number(PlayerData.items['Item_002']) || 0;
    const currentFrag = Number(PlayerData.items[CORE_FRAGMENT_ID]) || 0;
    const currentElement = Number(PlayerData.items[elementItemId]) || 0;

    if (currentCredit < CORE_CRAFT_COST_CREDIT) {
        showMessage("크레딧이 부족합니다.");
        return null;
    }
    if (currentFrag < CORE_CRAFT_COST_FRAGMENT) {
        showMessage("코어조각이 부족합니다.");
        return null;
    }
    if (currentElement < CORE_CRAFT_COST_ELEMENT) {
        showMessage("해당 속성 파편이 부족합니다.");
        return null;
    }

    PlayerData.items['Item_002'] -= CORE_CRAFT_COST_CREDIT;
    PlayerData.items[CORE_FRAGMENT_ID] -= CORE_CRAFT_COST_FRAGMENT;
    PlayerData.items[elementItemId] -= CORE_CRAFT_COST_ELEMENT;

    // 옵션 풀
    const validOptions = GameData.coreOptions.filter(o => {
        if (o.Core_E_Element !== '공용' && o.Core_E_Element !== element) return false;
        if (o.Core_E_Tier !== 1) return false;
        return true;
    });

    if (validOptions.length === 0) {
        showMessage("생성 가능한 옵션이 없습니다.");
        return null;
    }

    const slots = [];
    const pickedCounts = {};

    for (let i = 0; i < 3; i++) {
        const weightedPool = [];
        validOptions.forEach(opt => {
            const count = pickedCounts[opt.Core_E_ID] || 0;
            let weight = 100;
            if (count === 1) weight = 20;
            if (count === 2) weight = 2;
            
            for(let w = 0; w < weight; w++) {
                weightedPool.push(opt);
            }
        });

        const randomIndex = Math.floor(Math.random() * weightedPool.length);
        const selectedOpt = weightedPool[randomIndex];
        pickedCounts[selectedOpt.Core_E_ID] = (pickedCounts[selectedOpt.Core_E_ID] || 0) + 1;

        const maxVp = getMaxVp(selectedOpt.Core_E_Tier);
        const randomVp = getBellCurveRandom(0, maxVp * 10) / 10;
        const val = getStatFromVp(randomVp, selectedOpt);
        slots.push({ optionId: selectedOpt.Core_E_ID, value: val, vp: randomVp });
    }

    const newCore = {
        uid: generateCoreUID(),
        element: element,
        locked: false,
        favorite: false,
        equippedTo: null,
        slots: slots
    };

    if (!PlayerData.cores) PlayerData.cores = [];
    PlayerData.cores.push(newCore);
    
    updateTopCurrencies();
    // showMessage(`${element}의 코어를 제작했습니다.`);
    
    return newCore;
}

export function calculateCoreValue(core) {
    let total = 0;
    core.slots.forEach(slot => {
        const opt = GameData.coreOptions.find(o => o.Core_E_ID === slot.optionId);
        if (opt && CORE_BALANCE.VALUE_PER_TIER[opt.Core_E_Tier]) {
            total += CORE_BALANCE.VALUE_PER_TIER[opt.Core_E_Tier];
        }
    });
    return total;
}

/**
 * 옵션 수치 강화
 */
export function enhanceCoreOption(coreUid, slotIndex, addVp = 1) {
    if (!PlayerData.cores) return false;
    const core = PlayerData.cores.find(c => c.uid === coreUid);
    if (!core || !core.slots[slotIndex]) return false;

    const slot = core.slots[slotIndex];
    const optDef = GameData.coreOptions.find(o => o.Core_E_ID === slot.optionId);
    if (!optDef) return false;

    const currentVp = getCoreSlotVp(slot, optDef);
    const maxVp = getMaxVp(optDef.Core_E_Tier);

    if (currentVp >= maxVp) {
        showMessage("이미 해당 티어의 최대치입니다.");
        return false;
    }

    const newVp = Math.min(maxVp, Math.round((currentVp + addVp) * 10) / 10);
    slot.vp = newVp;
    slot.value = getStatFromVp(newVp, optDef);
    return true;
}

/**
 * 상위 티어로 승급
 */
export function promoteCoreOption(coreUid, slotIndex) {
    if (!PlayerData.cores) return false;
    const core = PlayerData.cores.find(c => c.uid === coreUid);
    if (!core || !core.slots[slotIndex]) return false;

    const slot = core.slots[slotIndex];
    const optDef = GameData.coreOptions.find(o => o.Core_E_ID === slot.optionId);
    if (!optDef) return false;

    const currentVp = getCoreSlotVp(slot, optDef);
    const maxVp = getMaxVp(optDef.Core_E_Tier);

    if (currentVp < maxVp) {
        showMessage("최대 밸류(MAX VP)에 도달해야 승급 가능합니다.");
        return false;
    }

    // T4는 승급 불가
    if (optDef.Core_E_Tier >= 3) {
        showMessage("최고 티어이므로 승급할 수 없습니다.");
        return false;
    }

    // 승급 비용 체크
    const promoteCost = optDef.Core_E_Tier * 100;
    if ((PlayerData.items['Item_010'] || 0) < promoteCost) {
        showMessage(`승급하려면 코어 조각 ${promoteCost}개가 필요합니다.`);
        return false;
    }

    // 동일 효과(Core_E_Desc), 상위 티어 찾기
    const nextTierOpt = GameData.coreOptions.find(o => 
        o.Core_E_Desc === optDef.Core_E_Desc && 
        o.Core_E_Tier === optDef.Core_E_Tier + 1
    );

    if (!nextTierOpt) {
        showMessage("상위 티어 옵션이 존재하지 않습니다.");
        return false;
    }

    // 비용 소모 및 승급 (새 티어의 최소치로 시작)
    PlayerData.items['Item_010'] -= promoteCost;
    slot.optionId = nextTierOpt.Core_E_ID;
    const nMaxVp = getMaxVp(nextTierOpt.Core_E_Tier);
    const nRandVp = getBellCurveRandom(0, nMaxVp * 10) / 10;
    slot.vp = nRandVp;
    slot.value = getStatFromVp(nRandVp, nextTierOpt); // 시작은 최하옵
    
    // showMessage(`코어 조각 ${promoteCost}개를 소모하여 승급했습니다!`);
    return true;
}
export function rerollCoreOption(coreUid, slotIndex) {
    if (!PlayerData.cores) return false;
    const core = PlayerData.cores.find(c => c.uid === coreUid);
    if (!core || !core.slots[slotIndex]) return false;

    const slot = core.slots[slotIndex];
    const optDef = GameData.coreOptions.find(o => o.Core_E_ID === slot.optionId);
    if (!optDef) return false;

    // 티어별 리롤 비용
    const rerollCosts = { 1: 3, 2: 5, 3: 7, 4: 10 };
    const cost = rerollCosts[optDef.Core_E_Tier] || 5;

    const currentFrag = PlayerData.items['Item_010'] || 0;
    if (currentFrag < cost) {
        showMessage(`코어 조각이 부족합니다. (필요: ${cost}개)`);
        return false;
    }

    PlayerData.items['Item_010'] -= cost;

    let targetTier = optDef.Core_E_Tier;
    let pool = [];

    if (targetTier <= 2) {
        pool = GameData.coreOptions.filter(o => o.Core_E_Tier === targetTier);
    } else if (targetTier === 3 || targetTier === 4) {
        // T3 또는 T4 리롤은 모두 T3 리롤 베이스로 취급 (T3 풀에서 돌연변이로 1% T4 등장)
        const hasOtherT4 = core.slots.some((s, i) => {
            if (i === slotIndex) return false; // 자기 자신 제외
            const sOpt = GameData.coreOptions.find(o => o.Core_E_ID === s.optionId);
            return sOpt && sOpt.Core_E_Tier === 4;
        });

        const rand = Math.random();
        if (!hasOtherT4 && rand < 0.02) { // 2% 확률로 T4
            pool = GameData.coreOptions.filter(o => o.Core_E_Tier === 4);
        } else {
            pool = GameData.coreOptions.filter(o => o.Core_E_Tier === 3);
        }
    }

    if (pool.length === 0) return false;

    // 현재 옵션 제외 (선택 풀이 1개 초과일 때만)
    if (pool.length > 1) {
        pool = pool.filter(o => o.Core_E_ID !== slot.optionId);
    }

    // 동일 효과 옵션 제외 (같은 장비 내에 중복 방지)
    const existingDesc = core.slots.map((s, i) => {
        if (i === slotIndex) return null;
        const o = GameData.coreOptions.find(opt => opt.Core_E_ID === s.optionId);
        return o ? o.Core_E_Desc : null;
    }).filter(d => d);
    
    let filteredPool = pool.filter(o => !existingDesc.includes(o.Core_E_Desc));
    if (filteredPool.length === 0) {
        filteredPool = pool;
    }

    const selectedOpt = filteredPool[Math.floor(Math.random() * filteredPool.length)];
    slot.optionId = selectedOpt.Core_E_ID;
    
    // 리롤 시 랜덤 VP 배정
    const rMaxVp = getMaxVp(selectedOpt.Core_E_Tier);
    const rRandVp = getBellCurveRandom(0, rMaxVp * 10) / 10;
    slot.vp = rRandVp;
    slot.value = getStatFromVp(rRandVp, selectedOpt);

    showMessage("옵션이 변경되었습니다!");
    return true;
}

export function getMaxVp(tier) {
    const vps = { 1: 5, 2: 10, 3: 20, 4: 30 };
    return vps[tier] || 10;
}

export function getCoreSlotVp(slot, optDef) {
    if (slot.vp !== undefined) return Math.round(slot.vp * 10) / 10;
    return getSlotVp(slot.value, optDef);
}

export function getSlotVp(slotValue, optDef) {
    if (!optDef) return 0;
    const min = optDef.Core_E_Min;
    const max = optDef.Core_E_Max;
    const maxVp = getMaxVp(optDef.Core_E_Tier);
    if (max === min) return maxVp;
    
    // Calculate VP based on current value
    const safeVal = parseInt(slotValue) || 0;
    let vp = Math.round(((safeVal - min) / (max - min)) * maxVp);
    return Math.max(0, Math.min(vp, maxVp));
}

export function getStatFromVp(vp, optDef) {
    if (!optDef) return 0;
    const min = optDef.Core_E_Min;
    const max = optDef.Core_E_Max;
    const maxVp = getMaxVp(optDef.Core_E_Tier);
    if (max === min) return max;
    
    // Inverse calculation
    let stat = min + ((max - min) * (vp / maxVp));
    return Math.floor(stat);
}

setInterval(() => { if (window.applyVolumeSettings && window.PlayerData) window.applyVolumeSettings(); }, 2000);
