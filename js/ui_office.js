import { PlayerData } from './state.js?v=004276';

window.getCharOfficeStat = function(charId, deptId) {
  const char = (GameData.characters.find(c => c.Character_ID === charId));
  if (!char) return 0;
  if (deptId === 'kitchen' || deptId === 'dismantle') {
    const pChar = PlayerData.characterStats[charId] || {};
    const starVal = pChar.star || char.Character_Star || 1;
    let tierVal = 1;
    if (char.Character_Tier === 'SR') tierVal = 2;
    if (char.Character_Tier === 'SSR') tierVal = 3;
    return Math.min(6, tierVal + starVal);
  }
  const typeInfo = OFFICE_TYPES.find(t => t.id === deptId);
  if (!typeInfo) return 0;
  return window.getCharMgmtStat(char.Character_ID, typeInfo.stat);
};

const OFFICE_TYPES = [

  { id: 'arcade', name: '오락실', stat: 'Character_M_Game', emoji: '🎮', items: ['Item_038', 'Item_037', 'Item_036'], maxActive: 2, maxRest: 4, next: 'pr' },
  { id: 'pr', name: '홍보실', stat: 'Character_M_Talk', emoji: '💬', items: ['Item_032', 'Item_031', 'Item_030'], maxActive: 2, maxRest: 4, next: 'recording' },
  { id: 'recording', name: '녹음실', stat: 'Character_M_Sing', emoji: '🎤', items: ['Item_026', 'Item_025', 'Item_024'], maxActive: 2, maxRest: 4, next: 'photo' },
  { id: 'photo', name: '촬영실', stat: 'Character_M_Sexy', emoji: '💋', items: ['Item_029', 'Item_028', 'Item_027'], maxActive: 2, maxRest: 4, next: 'production' },
  { id: 'production', name: '제작소', stat: 'Character_M_Plan', emoji: '💡', items: ['Item_035', 'Item_034', 'Item_033'], maxActive: 2, maxRest: 4, next: 'minecraft' },
  { id: 'kitchen', name: '주방', stat: null, emoji: '🍳', items: ['Item_020', 'Item_019', 'Item_018'], maxActive: 1, maxRest: 2, standalone: true },
  { id: 'dismantle', name: '분해기', stat: null, emoji: '⚙️', items: ['Item_001', 'Item_003', 'Item_004', 'Item_005', 'Item_006', 'Item_007', 'Item_008', 'Item_009', 'Item_010'], maxActive: 1, maxRest: 2, isDismantle: true },
  { id: 'minecraft', name: '마인크래프트', stat: 'Character_M_Passion', emoji: '🔥', items: ['Item_023', 'Item_022', 'Item_021'], maxActive: 2, maxRest: 4, next: 'arcade' }
];
window.OFFICE_TYPES = OFFICE_TYPES;


let selectedOfficeDept = null;
let currentOfficeDragSource = null;
let currentOfficeDragCharId = null;

window.initOfficeUI = function() {
  if (!PlayerData.office) {
    PlayerData.office = { supplies: {} };
    OFFICE_TYPES.forEach(t => {
      PlayerData.office[t.id] = { active: [], rest: [], progress: 0, craftItem: null, craftQueue: 0 };
    });
  }

  // Ensure array lengths
  OFFICE_TYPES.forEach(type => {
    let s = PlayerData.office[type.id];
    if (!s) s = PlayerData.office[type.id] = { active: [], rest: [], progress: 0, craftItem: null, craftQueue: 0 };
    while(s.active.length < type.maxActive) s.active.push(null);
    while(s.rest.length < type.maxRest) s.rest.push(null);
  });

  if (!PlayerData.office.lounge) {
    PlayerData.office.lounge = { rest: new Array(8).fill(null) };
  }
  if (!Array.isArray(PlayerData.office.lounge.rest)) {
    PlayerData.office.lounge.rest = new Array(8).fill(null);
  }
  while (PlayerData.office.lounge.rest.length < 8) {
    PlayerData.office.lounge.rest.push(null);
  }

  document.getElementById('btn-collect-supplies').addEventListener('click', () => {
    const supplies = PlayerData.office.supplies || {};
    let count = 0;
    for (const [itemId, qty] of Object.entries(supplies)) {
      if (qty > 0) {
        PlayerData.items[itemId] = (PlayerData.items[itemId] || 0) + qty;
        supplies[itemId] = 0;
        count += qty;
      }
    }
    if (count > 0) {
      
      updateOfficeUI();
    }
  });
  
  // Setup tick for office
  try {
    const now = Date.now();
    let dt = 0;
    if (PlayerData.lastOfficeUpdate) {
      dt = (now - PlayerData.lastOfficeUpdate) / 1000;
      tickOffice(dt);
    }
    PlayerData.lastOfficeUpdate = now;
    
    if (!window._officeIntervalStarted) {
      window._officeIntervalStarted = true;
      setInterval(() => {
        try {
          tickOffice(1);
        } catch (e) {
          console.error("tickOffice interval error:", e);
        }
      }, 1000);
    }
  } catch(e) { console.error(e); }

  updateOfficeUI();
}

window.updateOfficeUI = function() {
  renderOfficeSupplies();
  renderOfficeDepartments();
  renderOfficeLounge();
}

function renderOfficeLounge() {
  const container = document.getElementById('office-lounge-slots');
  if (!container) return;
  container.innerHTML = '';

  if (!PlayerData.office.lounge) {
    PlayerData.office.lounge = { rest: new Array(8).fill(null) };
  }
  if (!Array.isArray(PlayerData.office.lounge.rest)) {
    PlayerData.office.lounge.rest = new Array(8).fill(null);
  }
  while (PlayerData.office.lounge.rest.length < 8) {
    PlayerData.office.lounge.rest.push(null);
  }

  for (let i = 0; i < 8; i++) {
    const cid = PlayerData.office.lounge.rest[i] || null;
    const slotHtml = createOfficeSlotHTML(cid, 'lounge', 'rest', i);
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = slotHtml;
    container.appendChild(tempDiv.firstElementChild);
  }
}
window.renderOfficeLounge = renderOfficeLounge;

function renderOfficeSupplies() {
  window.renderOfficeSupplies = renderOfficeSupplies;
  const list = document.getElementById('office-supplies-list');
  if(!list) return;
  list.innerHTML = '';
  const supplies = PlayerData.office.supplies || {};
  let hasItem = false;
  for (const [itemId, qty] of Object.entries(supplies)) {
    if (qty > 0) {
      hasItem = true;
      const itemDef = GameData.items?.find(it => it.Item_ID === itemId);
      const icon = itemDef ? itemDef.Item_Icon : '❓';
      const name = itemDef ? itemDef.Item_Name : '아이템';
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.gap = '10px';
      row.style.marginBottom = '5px';
      row.style.background = 'rgba(0,0,0,0.3)';
      row.style.padding = '5px 10px';
      row.style.borderRadius = '5px';
      row.innerHTML = `<img src="${icon}" style="width:24px;height:24px;object-fit:contain;"> <span style="color:#fff; flex:1;">${name}</span> <span style="color:#f1c40f; font-weight:bold;">x${qty}</span>`;
      list.appendChild(row);
    }
  }
  if (!hasItem) {
    list.innerHTML = '<div style="color:#7f8c8d; text-align:center; margin-top:20px;">비품 창고가 비어있습니다.</div>';
  }
}


function getOfficeRawStat(deptId) {
  const state = PlayerData.office[deptId];
  let total = 0;
  if (!state || !state.active) return 0;
  state.active.forEach(cid => {
    if (cid) {
      const cond = PlayerData.characterStats[cid]?.condition ?? 100;
      if (cond > 0) {
        let statBoost = window.getCharMSkillEffect ? window.getCharMSkillEffect(cid, 'Self_Prod', deptId) : 0;
        total += (window.getCharOfficeStat(cid, deptId) + statBoost);
      }
    }
  });
  return total;
}
function getOfficeTotalStat(deptId) {
  const state = PlayerData.office[deptId];
  let total = 0;
  let activeCount = 0;
  if (!state || !state.active) return 0;
  state.active.forEach(cid => {
    if (cid) {
      const cond = PlayerData.characterStats[cid]?.condition ?? 100;
      if (cond > 0) {
        let statBoost = window.getCharMSkillEffect ? window.getCharMSkillEffect(cid, 'Self_Prod', deptId) : 0;
        total += (5 + window.getCharOfficeStat(cid, deptId) + statBoost);
        activeCount++;
      }
    }
  });

  return total;
}

function getRecipe(deptId, targetItemId) {
  const typeInfo = OFFICE_TYPES.find(t => t.id === deptId);
  const itemDef = GameData.items?.find(it => it.Item_ID === targetItemId);
  if (!itemDef) return null;
  const proReq = itemDef.Pro_Req || 100;
  
  if (typeInfo.isDismantle) {
    return { req: 300, materials: [{ id: targetItemId, count: 1 }], yields: { id: 'Item_002', count: itemDef.Item_Crush || 1 } };
  }
  
  if (typeInfo.standalone) {
    return { req: proReq, materials: [], yields: { id: targetItemId, count: 1 } };
  }
  
  const tIndex = typeInfo.items.indexOf(targetItemId); // 0=T1, 1=T2, 2=T3
  
  const nextInfo = OFFICE_TYPES.find(t => t.id === typeInfo.next);
  const nextNextInfo = OFFICE_TYPES.find(t => t.id === nextInfo?.next);
  
  const recipe = { req: proReq, materials: [], yields: { id: targetItemId, count: 1 } };
  if (tIndex === 1) { // T2
    recipe.materials.push({ id: typeInfo.items[0], count: 4 });
    if(nextInfo) recipe.materials.push({ id: nextInfo.items[0], count: 2 });
  } else if (tIndex === 2) { // T3
    recipe.materials.push({ id: typeInfo.items[1], count: 6 });
    if(nextInfo) recipe.materials.push({ id: nextInfo.items[1], count: 3 });
    if(nextNextInfo) recipe.materials.push({ id: nextNextInfo.items[1], count: 2 });
  }
  
  return recipe;
}

function renderOfficeDepartments() {
  const mainGrid = document.getElementById('office-grid-main');
  const mgmtGrid = document.getElementById('office-grid-mgmt');
  if(!mainGrid || !mgmtGrid) return;
  mainGrid.innerHTML = '';
  mgmtGrid.innerHTML = '';
  
  OFFICE_TYPES.forEach(type => {
    if (!PlayerData.office[type.id]) {
      PlayerData.office[type.id] = {
        level: 1,
        active: new Array(type.maxActive).fill(null),
        rest: new Array(type.maxRest).fill(null),
        craftItem: null,
        craftQueue: 0,
        progress: 0
      };
    }
    const state = PlayerData.office[type.id];
    if (!Array.isArray(state.active)) state.active = new Array(type.maxActive).fill(null);
    while (state.active.length < type.maxActive) state.active.push(null);
    if (!Array.isArray(state.rest)) state.rest = new Array(type.maxRest).fill(null);
    while (state.rest.length < type.maxRest) state.rest.push(null);

    let totalStat = getOfficeTotalStat(type.id);
    let rawStat = getOfficeRawStat(type.id);
    
    let recipe = null;
    let itemIcon = '❓';
    let isStopped = false;
    let gaugePct = 0;
    
    if (state.craftItem && state.craftQueue > 0) {
      recipe = getRecipe(type.id, state.craftItem);
      const itemDef = GameData.items?.find(it => it.Item_ID === state.craftItem);
      if (itemDef) itemIcon = itemDef.Item_Icon;
      if (recipe && recipe.req > 0) {
        gaugePct = Math.min(100, (state.progress / recipe.req) * 100);
      }
    }
    
    // Check material shortage only if queue is somehow running without materials?
    // Wait, Q5 says materials are deducted UPFRONT. So shortage is impossible during production.
    // If craftQueue is 0, just say 대기중
    
    let greatBoost = 0;
    if (state.active) {
        state.active.forEach(cid => {
            if (cid && (PlayerData.characterStats[cid]?.condition ?? 100) > 0) {
                greatBoost += window.getCharMSkillEffect ? window.getCharMSkillEffect(cid, 'Self_Great', type.id) : 0;
            }
        });
    }
    let greatSuccessPct = Math.min(100, 5 + (totalStat * 1) + greatBoost);
    
    let infoHtml = `
      <div style="display:flex; gap:10px; align-items:center; margin-bottom:10px;">
        <div style="display:flex; flex-direction:column; align-items:center; gap:4px;">
          <button class="office-craft-btn" onclick="openOfficeCraftModal('${type.id}')" style="width:48px; height:48px; background:rgba(0,0,0,0.5); border:1px solid #7f8c8d; border-radius:8px; cursor:pointer; padding:5px; position:relative;">
            ${state.craftQueue > 0 ? `<img src="${itemIcon}" style="width:100%; height:100%; object-fit:contain;">` : '<span style="color:#7f8c8d; font-size:24px;">+</span>'}
          </button>
          ${type.id === 'dismantle' && state.craftQueue > 0 && recipe ? `<div style="font-size:10px; color:#f1c40f; font-weight:bold;">1 ▶ ${recipe.yields.count}</div>` : ''}
        </div>
        <div style="flex:1;">
          <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:3px; font-weight:bold; color:#fff; text-shadow: 1px 1px 2px #000;">
            <span id="office-prog-status-${type.id}">${state.craftQueue > 0 ? (type.id === 'dismantle' ? '분해중' : '제작중') : '대기중'}</span>
            <span id="office-prog-left-${type.id}">${state.craftQueue > 0 ? `잔여: ${state.craftQueue}회` : ''}</span>
          </div>
          <div style="background:#2c3e50; height:18px; border-radius:9px; overflow:hidden; border:1px solid #34495e; position:relative;">
            <div id="office-prog-fill-${type.id}" style="background:${state.craftQueue > 0 ? '#3498db' : '#7f8c8d'}; height:100%; width:${gaugePct}%; transition:width 0.2s;"></div>
            <div id="office-prog-txt-${type.id}" style="position:absolute; top:0; left:0; width:100%; height:100%; display:flex; justify-content:center; align-items:center; font-size:10px; font-weight:bold; color:white; text-shadow:1px 1px 2px black;">${state.craftQueue > 0 ? `${gaugePct.toFixed(1)}% (${Math.floor(state.progress)} / ${recipe ? recipe.req : 0})` : ''}</div>
          </div>
        </div>
      </div>
    `;
    
    let html = `
      <div class="studio-card">
        <div class="studio-header">
          <div class="studio-title"><span class="studio-emoji">${type.emoji}</span> ${type.name}</div>
          <button class="studio-info-btn">?
            <div class="studio-tooltip">${type.emoji} 합산 스탯: ${rawStat}<br>대성공 확률: ${greatSuccessPct}%<br>게이지 증가량: 초당 ${totalStat}</div>
          </button>
        </div>
        ${infoHtml}
        <div class="studio-slots" style="display:flex; flex-direction:column; gap:12px; margin-top:-5px;">
          <div class="studio-slots-row" id="active-slots-${type.id}">
    `;
    
    for (let i = 0; i < type.maxActive; i++) {
      const cid = state.active[i] || null;
      html += createOfficeSlotHTML(cid, type.id, 'active', i);
    }
    
    html += `</div><div class="studio-slots-row" id="rest-slots-${type.id}">`;
    
    for (let i = 0; i < type.maxRest; i++) {
      const cid = state.rest[i] || null;
      html += createOfficeSlotHTML(cid, type.id, 'rest', i);
    }
    
    html += `</div></div></div>`;
    
    const div = document.createElement('div');
    div.innerHTML = html;
    if (type.maxActive === 1) {
      mgmtGrid.appendChild(div.firstElementChild);
    } else {
      mainGrid.appendChild(div.firstElementChild);
    }
  });
}

function createOfficeSlotHTML(charId, deptId, slotType, index) {
  const isDrop = currentOfficeDragSource && currentOfficeDragSource !== `${deptId}-${slotType}-${index}`;
  
  if (charId) {
    const char = (GameData.characters.find(c => c.Character_ID === charId));
    const cond = PlayerData.characterStats[charId]?.condition ?? 100;
    const condPct = Math.min(100, Math.max(0, cond));
    let condColor = '#2ecc71';
    if (cond < 30) condColor = '#e74c3c';
    else if (cond < 70) condColor = '#f1c40f';
    
    const typeInfo = (deptId === 'lounge') ? { id: 'lounge', name: '휴게공간', emoji: '🛋️', stat: null } : OFFICE_TYPES.find(t => t.id === deptId);
    const statVal = (typeInfo && !typeInfo.isDismantle && typeInfo.stat) ? (window.getCharMgmtStat(char.Character_ID, typeInfo.stat)) : '';
    const statText = statVal !== '' ? `${typeInfo.emoji} ${statVal}` : (deptId === 'lounge' ? '<span style="color:#2ecc71; font-weight:bold;">+50%</span>' : '');
    const stateIcon = slotType === 'active' ? '⚡' : '💤';
    
    return `
      <div class="studio-slot ${isDrop ? 'droppable' : ''}" 
           draggable="true" 
           ondragstart="handleOfficeDragStart(event, '${deptId}', '${slotType}', ${index}, '${charId}')"
           ondragover="handleOfficeDragOver(event)"
           ondrop="handleOfficeDrop(event, '${deptId}', '${slotType}', ${index})"
           onclick="removeOfficeChar('${deptId}', '${slotType}', ${index}); hideOfficeCharTooltip();"
           onmouseenter="showOfficeCharTooltip('${charId}', '${deptId}', '${slotType}')" 
           onmouseleave="hideOfficeCharTooltip()">
        <div class="studio-slot-top-bar">
          <span>${stateIcon}</span>
          <span>${statText}</span>
        </div>
        <div class="studio-slot-img" style="background-image:url('${char.Character_Image_Full}')">
          <div class="studio-slot-hover-overlay">배치 해제</div>
          <div class="studio-cond-text">${Math.floor(cond)}</div>
          <div class="studio-cond-bar-wrap">
            <div class="studio-cond-bar" style="width:${condPct}%; background:${condColor};"></div>
          </div>
        </div>
      </div>
    `;
  } else {
    return `
      <div class="studio-slot empty ${isDrop ? 'droppable' : ''}" 
           ondragover="handleOfficeDragOver(event)"
           ondrop="handleOfficeDrop(event, '${deptId}', '${slotType}', ${index})"
           onclick="openOfficeRoster('${deptId}', '${slotType}', ${index})">
        <div class="studio-slot-top-bar" style="background:transparent; border:none; height:16px;"></div>
        <div class="studio-slot-img" style="display:flex; align-items:center; justify-content:center; color:rgba(255,255,255,0.3); font-size:1.5em; height:50px;">+</div>
      </div>
    `;
  }
}

window.handleOfficeDragStart = function(e, deptId, slotType, index, charId) {
  currentOfficeDragSource = `${deptId}-${slotType}-${index}`;
  currentOfficeDragCharId = charId;
  e.dataTransfer.effectAllowed = 'move';
  updateOfficeUI(); 
}
function handleOfficeDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
}
window.handleOfficeDrop = function(e, deptId, slotType, index) {
  e.preventDefault();
  if (!currentOfficeDragSource) return;
  const [srcDept, srcType, srcIdxStr] = currentOfficeDragSource.split('-');
  const srcIdx = parseInt(srcIdxStr);
  const srcState = PlayerData.office[srcDept];
  const dstState = PlayerData.office[deptId];
  
  if (currentOfficeDragCharId && PlayerData.characterStats && PlayerData.characterStats[currentOfficeDragCharId]) {
    if (PlayerData.characterStats[currentOfficeDragCharId].condition === undefined) {
      PlayerData.characterStats[currentOfficeDragCharId].condition = 100;
    }
  }
  const targetCharId = dstState[slotType][index];
  dstState[slotType][index] = currentOfficeDragCharId;
  srcState[srcType][srcIdx] = targetCharId;
  
  currentOfficeDragSource = null;
  currentOfficeDragCharId = null;
  
  
  updateOfficeUI();
}

window.openOfficeRoster = function(deptId, slotType, index) {
  const typeInfo = (deptId === 'lounge') ? { id: 'lounge', name: '휴게공간', emoji: '🛋️', stat: null } : OFFICE_TYPES.find(t => t.id === deptId);
  const modal = document.getElementById('studio-roster-modal');
  const grid = document.getElementById('studio-roster-list-modal');
  grid.innerHTML = '';
  
  if (!modal || !typeInfo) return;
  modal.classList.add('show');
  
  const deployed = new Set();
  OFFICE_TYPES.forEach(t => {
    PlayerData.office[t.id].active.forEach(c => { if(c) deployed.add(c); });
    PlayerData.office[t.id].rest.forEach(c => { if(c) deployed.add(c); });
  });
  if (PlayerData.office.lounge && Array.isArray(PlayerData.office.lounge.rest)) {
    PlayerData.office.lounge.rest.forEach(c => { if(c) deployed.add(c); });
  }
  if (PlayerData.studio) {
    Object.keys(PlayerData.studio).forEach(typeId => {
      if (typeId === 'donations') return;
      const s = PlayerData.studio[typeId];
      if (s && s.active) s.active.forEach(c => { if(c) deployed.add(c); });
      if (s && s.rest) s.rest.forEach(c => { if(c) deployed.add(c); });
    });
  }
  
  const allChars = GameData.characters.filter(c => PlayerData.characterStats[c.Character_ID]);
  const rarityOrder = { 'SSR': 3, 'SR': 2, 'R': 1 };
  
  allChars.sort((a, b) => {
    const ra = rarityOrder[a.Character_Tier] || 0;
    const rb = rarityOrder[b.Character_Tier] || 0;
    if (ra !== rb) return rb - ra;
    
    if (typeInfo.stat) {
      const sa = window.getCharMgmtStat(a.Character_ID, typeInfo.stat);
      const sb = window.getCharMgmtStat(b.Character_ID, typeInfo.stat);
      if (sa !== sb) return sb - sa;
    }
    return a.Character_ID.localeCompare(b.Character_ID);
  });
  
  let currentGroup = '';
  
  allChars.forEach(char => {
    if (char.Character_Tier !== currentGroup) {
      currentGroup = char.Character_Tier;
      const header = document.createElement('div');
      header.style.gridColumn = '1 / -1';
      header.style.background = '#2c3e50';
      header.style.color = '#f1c40f';
      header.style.padding = '5px 10px';
      header.style.fontWeight = 'bold';
      header.style.borderRadius = '4px';
      header.style.marginTop = '10px';
      header.textContent = `${currentGroup} 등급`;
      grid.appendChild(header);
    }
    
    const charId = char.Character_ID;
    const cond = PlayerData.characterStats[charId]?.condition ?? 100;
    const isDep = deployed.has(charId);
    
    let depDept = '';
    let depSlot = '';
    let depEmoji = '';
    let isStudio = false;
    if (isDep) {
      OFFICE_TYPES.forEach(t => {
        if (PlayerData.office[t.id].active.includes(charId)) { depDept = t.id; depEmoji = t.emoji; depSlot = 'active'; }
        if (PlayerData.office[t.id].rest.includes(charId)) { depDept = t.id; depEmoji = t.emoji; depSlot = 'rest'; }
      });
      if (!depDept && PlayerData.office.lounge && Array.isArray(PlayerData.office.lounge.rest) && PlayerData.office.lounge.rest.includes(charId)) {
        depDept = 'lounge'; depEmoji = '🛋️'; depSlot = 'rest';
      }
      if (!depDept && PlayerData.studio) {
         Object.keys(PlayerData.studio).forEach(typeId => {
            if (typeId === 'donations') return;
            const s = PlayerData.studio[typeId];
            if (s && s.active && s.active.includes(charId)) { depDept = typeId; depSlot = 'active'; isStudio = true; }
            if (s && s.rest && s.rest.includes(charId)) { depDept = typeId; depSlot = 'rest'; isStudio = true; }
         });
      }
    }
    
    const div = document.createElement('div');
    div.className = 'studio-roster-char';
    div.style.height = '76px';
    
    let condColor = '#2ecc71';
    if (cond < 70) condColor = '#f1c40f';
    if (cond < 30) condColor = '#e74c3c';
    
    const statVal = typeInfo.stat ? (window.getCharMgmtStat(char.Character_ID, typeInfo.stat)) : '';
    const statText = typeInfo.stat ? `${typeInfo.emoji} ${statVal}` : (deptId === 'lounge' ? '+50%' : '');
    
    let stateText = '대기중';
    let stateIcon = '';
    if (isDep) {
      if (isStudio) {
         stateIcon = depSlot === 'active' ? '📺' : '💤';
         stateText = depSlot === 'active' ? '방송중' : '휴식중';
      } else if (depDept === 'lounge') {
         stateIcon = '🛋️';
         stateText = '휴게중';
      } else {
         stateIcon = depSlot === 'active' ? '⚡' : '💤';
         stateText = depSlot === 'active' ? '작업중' : '휴식중';
      }
    }
    
    const topBarHtml = `
      <div class="studio-slot-top-bar" style="background:${isDep ? '#e67e22' : '#2c3e50'}; justify-content:space-between;">
        <span>${stateIcon} ${stateText}</span>
        <span>${statText}</span>
      </div>
    `;
    
    div.innerHTML = `
      ${topBarHtml}
      <div class="studio-roster-img" style="background-image:url('${char.Character_Image_Full}')">
        ${isDep ? '<div style="position:absolute; inset:0; background:rgba(0,0,0,0.4);"></div>' : ''}
        <div class="studio-cond-text">${Math.floor(cond)}</div>
        <div class="studio-cond-bar-wrap">
          <div class="studio-cond-bar" style="width:${cond}%; background:${condColor};"></div>
        </div>
      </div>
    `;
    
    div.addEventListener('click', () => {
      OFFICE_TYPES.forEach(t => {
        const os = PlayerData.office[t.id];
        let aIdx = os.active.indexOf(charId);
        if(aIdx !== -1) os.active[aIdx] = null;
        let rIdx = os.rest.indexOf(charId);
        if(rIdx !== -1) os.rest[rIdx] = null;
      });
      if (PlayerData.office.lounge && Array.isArray(PlayerData.office.lounge.rest)) {
        let lIdx = PlayerData.office.lounge.rest.indexOf(charId);
        if (lIdx !== -1) PlayerData.office.lounge.rest[lIdx] = null;
      }
      
      if (PlayerData.studio) {
        Object.keys(PlayerData.studio).forEach(typeId => {
          if (typeId === 'donations') return;
          const s = PlayerData.studio[typeId];
          if (s && s.active) {
              let idx = s.active.indexOf(charId);
              if (idx !== -1) s.active[idx] = null;
          }
          if (s && s.rest) {
              let idx = s.rest.indexOf(charId);
              if (idx !== -1) s.rest[idx] = null;
          }
        });
        if (window.refreshStudioUI) window.refreshStudioUI();
      }

      // Place
      if (charId && PlayerData.characterStats && PlayerData.characterStats[charId]) {
        if (PlayerData.characterStats[charId].condition === undefined) {
          PlayerData.characterStats[charId].condition = 100;
        }
      }
      PlayerData.office[deptId][slotType][index] = charId;
      
      updateOfficeUI();
      modal.classList.remove('show');
      if (window.hideRosterTooltip) window.hideRosterTooltip();
    });

    div.addEventListener('mouseenter', (e) => window.showRosterTooltip(e, charId, deptId));
    div.addEventListener('mouseleave', window.hideRosterTooltip);
    
    grid.appendChild(div);
  });
}

window.openOfficeCraftModal = function(deptId) {
  const typeInfo = OFFICE_TYPES.find(t => t.id === deptId);
  const state = PlayerData.office[deptId];
  
  // Custom Craft Modal for Office
  let modal = document.getElementById('office-craft-modal');
  if(!modal) {
    modal = document.createElement('div');
    modal.id = 'office-craft-modal';
    modal.style.position = 'fixed';
    modal.style.top = '0'; modal.style.left = '0'; modal.style.width = '100%'; modal.style.height = '100%';
    modal.style.background = 'rgba(0,0,0,0.8)';
    modal.style.display = 'none';
    modal.style.alignItems = 'center'; modal.style.justifyContent = 'center';
    modal.style.zIndex = '99999';
    
    modal.innerHTML = `
      <div style="background:#2c3e50; border:2px solid #34495e; border-radius:10px; padding:20px; width:400px; color:#fff;">
        <h3 id="ocm-title" style="margin-top:0; border-bottom:2px solid #34495e; padding-bottom:10px;">가공 선택</h3>
        <div id="ocm-items" style="display:grid; grid-template-columns:repeat(3, 1fr); gap:10px; margin-bottom:20px;"></div>
        <div id="ocm-detail" style="background:rgba(0,0,0,0.3); padding:10px; border-radius:5px; min-height:100px; margin-bottom:15px;"></div>
        <div id="ocm-controls" style="display:flex; flex-direction:column; gap:10px; display:none;">
          <div style="display:flex; align-items:center; justify-content:space-between;">
            <button id="ocm-btn-minus" class="circle-btn" style="width:30px;height:30px;">-</button>
            <input type="range" id="ocm-slider" min="1" max="99" value="1" style="flex:1; margin:0 10px;">
            <button id="ocm-btn-plus" class="circle-btn" style="width:30px;height:30px;">+</button>
            <span id="ocm-qty" style="font-size:18px; font-weight:bold; min-width:40px; text-align:right;">1</span>
          </div>
          <button id="ocm-btn-craft" class="execute-btn" style="width:100%; padding:10px;">가공 지시</button>
        </div>
        <button id="ocm-btn-cancel-craft" class="cancel-btn" style="width:100%; padding:10px; margin-top:10px; display:none;">제작 취소(재료 반환)</button>
        <button class="cancel-btn" style="width:100%; margin-top:10px;" onclick="document.getElementById('office-craft-modal').style.display='none'">닫기</button>
      </div>
    `;
    document.body.appendChild(modal);
    
    document.getElementById('ocm-slider').addEventListener('input', (e) => {
      document.getElementById('ocm-qty').innerText = e.target.value;
      renderOfficeCraftDetail();
    });
    document.getElementById('ocm-btn-minus').addEventListener('click', () => {
      const sl = document.getElementById('ocm-slider');
      sl.value = Math.max(sl.min, parseInt(sl.value)-1);
      document.getElementById('ocm-qty').innerText = sl.value;
      renderOfficeCraftDetail();
    });
    document.getElementById('ocm-btn-plus').addEventListener('click', () => {
      const sl = document.getElementById('ocm-slider');
      sl.value = Math.min(sl.max, parseInt(sl.value)+1);
      document.getElementById('ocm-qty').innerText = sl.value;
      renderOfficeCraftDetail();
    });
    
    document.getElementById('ocm-btn-craft').addEventListener('click', () => {
      const selId = PlayerData._officeTempCraftItem;
      const deptId = PlayerData._officeTempDept;
      const qty = parseInt(document.getElementById('ocm-slider').value);
      const recipe = getRecipe(deptId, selId);
      if(!recipe) return;
      
      // Deduct materials
      recipe.materials.forEach(m => {
        PlayerData.items[m.id] = (PlayerData.items[m.id] || 0) - (m.count * qty);
      });
      
      const st = PlayerData.office[deptId];
      if (st.craftItem === selId) {
        st.craftQueue += qty;
      } else {
        st.craftItem = selId;
        st.craftQueue = qty;
        st.progress = 0;
      }
      
      
      
      updateOfficeUI();
      document.getElementById('office-craft-modal').style.display='none';
    });
    
    document.getElementById('ocm-btn-cancel-craft').addEventListener('click', () => {
      const deptId = PlayerData._officeTempDept;
      const st = PlayerData.office[deptId];
      if (st.craftQueue > 0 && st.craftItem) {
        const recipe = getRecipe(deptId, st.craftItem);
        if (recipe) {
          recipe.materials.forEach(m => {
            PlayerData.items[m.id] = (PlayerData.items[m.id] || 0) + (m.count * st.craftQueue);
          });
        }
        st.craftQueue = 0;
        st.craftItem = null;
        st.progress = 0;
        
        updateOfficeUI();
        if (typeof window.savePlayerData === 'function') {
          window.savePlayerData();
        }
        
        const typeInfo = OFFICE_TYPES.find(t => t.id === deptId);
        const itemsContainer = document.getElementById('ocm-items');
        if (itemsContainer) {
          itemsContainer.style.display = typeInfo?.isDismantle ? 'flex' : 'grid';
        }
        const cancelBtn = document.getElementById('ocm-btn-cancel-craft');
        if (cancelBtn) cancelBtn.style.display = 'none';
        const detailEl = document.getElementById('ocm-detail');
        if (detailEl) {
          detailEl.innerHTML = '<div style="color:#2ecc71; text-align:center; padding-top:20px; font-weight:bold;">제작이 취소되고 재료가 반환되었습니다.<br><span style="color:#cbd5e1; font-size:12px; font-weight:normal;">새로 가공할 아이템을 선택하세요.</span></div>';
        }
        const ctrlEl = document.getElementById('ocm-controls');
        if (ctrlEl) ctrlEl.style.display = 'none';
      }
    });
  }
  
  document.getElementById('ocm-title').innerText = `${typeInfo.name} - 가공 선택`;
  PlayerData._officeTempDept = deptId;
  PlayerData._officeTempCraftItem = null;
  
  const itemsContainer = document.getElementById('ocm-items');
  itemsContainer.innerHTML = '';
  // If Dismantle, grid needs to wrap nicely.
  if (typeInfo.isDismantle) {
    itemsContainer.style.display = 'flex';
    itemsContainer.style.flexWrap = 'wrap';
  } else {
    itemsContainer.style.display = 'grid';
  }
  
  typeInfo.items.forEach(itemId => {
    const itemDef = GameData.items?.find(it => it.Item_ID === itemId);
    if (!itemDef) return;
    const btn = document.createElement('div');
    btn.style.background = 'rgba(0,0,0,0.5)';
    btn.style.border = '1px solid #7f8c8d';
    btn.style.borderRadius = '5px';
    btn.style.padding = '10px';
    btn.style.cursor = 'pointer';
    btn.style.textAlign = 'center';
    if(typeInfo.isDismantle) {
      btn.style.width = '60px';
    }
    btn.innerHTML = `<img src="${itemDef.Item_Icon}" style="width:30px; height:30px; object-fit:contain;"><br><span style="font-size:10px;">${itemDef.Item_Name}</span>`;
    btn.onclick = () => {
      Array.from(itemsContainer.children).forEach(c => c.style.borderColor = '#7f8c8d');
      btn.style.borderColor = '#f1c40f';
      PlayerData._officeTempCraftItem = itemId;
      
      const recipe = getRecipe(deptId, itemId);
      let maxCraft = 99;
      recipe.materials.forEach(m => {
        const inv = PlayerData.items[m.id] || 0;
        const possible = Math.floor(inv / m.count);
        if (possible < maxCraft) maxCraft = possible;
      });
      
      const slider = document.getElementById('ocm-slider');
      slider.max = maxCraft > 0 ? maxCraft : 1;
      slider.value = 1;
      document.getElementById('ocm-qty').innerText = '1';
      
      document.getElementById('ocm-controls').style.display = maxCraft > 0 ? 'flex' : 'none';
      renderOfficeCraftDetail();
    };
    itemsContainer.appendChild(btn);
  });
  
  const cancelBtn = document.getElementById('ocm-btn-cancel-craft');
  if (state.craftQueue > 0) {
    cancelBtn.style.display = 'block';
    itemsContainer.style.display = 'none';
    const curItemDef = GameData.items?.find(it => it.Item_ID === state.craftItem);
    document.getElementById('ocm-detail').innerHTML = `<div style="color:#f1c40f; text-align:center; padding:15px; font-weight:bold;">현재 작업이 진행 중입니다.<br><span style="color:#fff; font-size:1.05rem;">[ ${curItemDef ? curItemDef.Item_Name : state.craftItem} x ${state.craftQueue} ]</span><br><br><span style="color:#ef4444; font-size:12px; font-weight:normal;">새로운 작업을 시작하려면 먼저 아래의 제작 취소 버튼을 누르세요.</span></div>`;
  } else {
    cancelBtn.style.display = 'none';
    itemsContainer.style.display = typeInfo.isDismantle ? 'flex' : 'grid';
    document.getElementById('ocm-detail').innerHTML = '<div style="color:#7f8c8d; text-align:center; padding-top:30px;">아이템을 선택하세요.</div>';
  }
  document.getElementById('ocm-controls').style.display = 'none';
  
  modal.style.display = 'flex';
}

window.renderOfficeCraftDetail = function() {
  const deptId = PlayerData._officeTempDept;
  const itemId = PlayerData._officeTempCraftItem;
  if (!deptId || !itemId) return;
  const typeInfo = OFFICE_TYPES.find(t => t.id === deptId);
  const recipe = getRecipe(deptId, itemId);
  if (!recipe) return;
  
  const qty = parseInt(document.getElementById('ocm-slider').value) || 1;
  const itemDef = GameData.items?.find(it => it.Item_ID === itemId);
  
  let html = `
    <div style="font-weight:bold; margin-bottom:10px; color:#f1c40f;">${itemDef?.Item_Name} x ${qty} 제작</div>
    <div style="margin-bottom:10px;">요구 생산력: ${(recipe.req * qty).toLocaleString()}</div>
  `;
  
  if (recipe.materials.length === 0) {
    html += '<div style="color:#2ecc71;">소모 재료 없음</div>';
  } else {
    html += '<div style="font-size:12px; margin-bottom:5px;">요구 재료:</div>';
    let canCraft = true;
    recipe.materials.forEach(m => {
      const mDef = GameData.items?.find(it => it.Item_ID === m.id);
      const reqAmt = m.count * qty;
      const invAmt = PlayerData.items[m.id] || 0;
      const color = invAmt >= reqAmt ? '#2ecc71' : '#e74c3c';
      if (invAmt < reqAmt) canCraft = false;
      html += `
        <div style="display:flex; align-items:center; gap:5px; margin-bottom:3px; background:rgba(0,0,0,0.5); padding:3px; border-radius:3px;">
          <img src="${mDef?.Item_Icon}" style="width:20px;height:20px;object-fit:contain;">
          <span style="flex:1; font-size:11px;">${mDef?.Item_Name}</span>
          <span style="color:${color}; font-weight:bold; font-size:12px;">${reqAmt}</span>
          <span style="color:#7f8c8d; font-size:10px;">/ ${invAmt}</span>
        </div>
      `;
    });
    
    document.getElementById('ocm-controls').style.display = canCraft ? 'flex' : 'none';
  }
  
  // Also show yields info if Dismantle
  if (typeInfo.isDismantle) {
     const yieldDef = GameData.items?.find(it => it.Item_ID === recipe.yields.id);
     html += `
       <div style="margin-top:10px; border-top:1px dashed #7f8c8d; padding-top:10px;">
         <span style="color:#3498db; font-size:12px;">예상 획득:</span>
         <div style="display:flex; align-items:center; gap:5px; margin-top:3px;">
           <img src="${yieldDef?.Item_Icon}" style="width:20px;height:20px;object-fit:contain;">
           <span style="font-size:12px; color:#f1c40f; font-weight:bold;">${(recipe.yields.count * qty).toLocaleString()}</span>
         </div>
       </div>
     `;
  }
  
  document.getElementById('ocm-detail').innerHTML = html;
}

function showOfficeTooltip(deptId, element) {
  const typeInfo = OFFICE_TYPES.find(t => t.id === deptId);
  const totalStat = window.getOfficeTotalStat(deptId);
  let html = `
    <div style="font-weight:bold; border-bottom:1px solid #7f8c8d; padding-bottom:5px; margin-bottom:5px;">
      ${typeInfo.name} 정보
    </div>
    <div>${typeInfo.emoji} 합산 스탯: ${totalStat}</div>
    <div style="margin-top:5px; font-size:11px; color:#f1c40f;">게이지 증가량 : 초당 ${totalStat}</div>
    <div style="margin-top:5px; font-size:11px; color:#f1c40f;">대성공 확률 : ${Math.min(100, 5 + totalStat)}%</div>
  `;
  
  let tooltip = document.getElementById('office-help-tooltip');
  if(!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'office-help-tooltip';
    tooltip.style.position = 'absolute';
    tooltip.style.background = 'rgba(0,0,0,0.9)';
    tooltip.style.border = '1px solid #7f8c8d';
    tooltip.style.padding = '10px';
    tooltip.style.borderRadius = '5px';
    tooltip.style.color = '#fff';
    tooltip.style.zIndex = '9999';
    tooltip.style.pointerEvents = 'none';
    document.body.appendChild(tooltip);
  }
  
  tooltip.innerHTML = html;
  const rect = element.getBoundingClientRect();
  tooltip.style.top = (rect.top + window.scrollY + 20) + 'px';
  tooltip.style.left = (rect.left + window.scrollX + 20) + 'px';
  tooltip.style.display = 'block';
}

function hideOfficeTooltip() {
  const tooltip = document.getElementById('office-help-tooltip');
  if(tooltip) tooltip.style.display = 'none';
}

let lastOfficeTickUpdate = 0;

window.tickOffice = function(dtSeconds) {
  if (dtSeconds <= 0) return;
  if (!PlayerData.office) return;
  if (!PlayerData.office.supplies) PlayerData.office.supplies = {};
  
  const mgmtA = (window.getMgmtARate ? window.getMgmtARate() : 3) / 60; // recover/sec
  const mgmtB = (window.getMgmtBRate ? window.getMgmtBRate() : 1) / 60; // consume/sec
  
  let needsUIUpdate = false;
  
  // 1. Condition Update (using same mgmt rates for consistency, though Office doesn't explicitly have mgmt rooms, they share the global mgmt effects)
  // Wait, does Office use mgmt effects? The user said "컨디션, 배치 등의 시스템은 일치합니다." so yes.
  const deployedChars = new Set();
  
  OFFICE_TYPES.forEach(type => {
    let s = PlayerData.office[type.id];
    if (!s) {
      s = PlayerData.office[type.id] = {
        level: 1,
        active: new Array(type.maxActive).fill(null),
        rest: new Array(type.maxRest).fill(null),
        craftItem: null,
        craftQueue: 0,
        progress: 0
      };
    }
    if (!Array.isArray(s.active)) s.active = new Array(type.maxActive).fill(null);
    if (!Array.isArray(s.rest)) s.rest = new Array(type.maxRest).fill(null);
    
    // Condition loop
    s.active.forEach((cid, index) => {
      if(cid) {
        deployedChars.add(cid);
        const stats = PlayerData.characterStats[cid];
        if (stats) {
          if (stats.condition === undefined) stats.condition = 100;
          let selfDrainReduce = (window.getCharMSkillEffect ? window.getCharMSkillEffect(cid, 'Self_Cond_Drain', 'ALL') : 0) / 60;
          let actualDrain = Math.max(0, mgmtB - selfDrainReduce);
          stats.condition = Math.max(0, stats.condition - (actualDrain * dtSeconds));
        }
        
        // Auto-swap logic
        if (stats.condition <= 0) {
          let bestIdx = -1, bestStat = -1, emptyIdx = -1;
          s.rest.forEach((rcid, ridx) => {
            if(rcid) {
              const rstats = PlayerData.characterStats[rcid];
              if((rstats.condition || 100) >= 100) {
                const rchar = GameData.characters ? GameData.characters.find(c => c.Character_ID === rcid) : null;
                const rval = rchar ? window.getCharMgmtStat(rchar.Character_ID, type.stat) : 0;
                if(rval > bestStat) { bestStat = rval; bestIdx = ridx; }
              }
            } else if (emptyIdx === -1) {
              emptyIdx = ridx;
            }
          });
          if(bestIdx !== -1) {
            s.active[index] = s.rest[bestIdx];
            s.rest[bestIdx] = cid;
            needsUIUpdate = true;
          } else if (emptyIdx !== -1) {
            s.rest[emptyIdx] = cid;
            s.active[index] = null;
            needsUIUpdate = true;
          }
        }
      }
    });
    s.rest.forEach(cid => {
      if (cid) {
        deployedChars.add(cid);
        const stats = PlayerData.characterStats[cid];
        if (stats) {
          if (stats.condition === undefined) stats.condition = 100;
          let selfRecoverBoost = (window.getCharMSkillEffect ? window.getCharMSkillEffect(cid, 'Self_Cond_Recover', 'ALL') : 0) / 60;
          let actualRecover = mgmtA + selfRecoverBoost;
          stats.condition = Math.min(100, stats.condition + (actualRecover * dtSeconds));
          // --- AUTO CONSUME SNACK ---
          const reserve = Number(window.PlayerData.snackReserve || 0);
          if (window.PlayerData.activeSnack && stats.condition <= 5) {
            const activeItemId = window.PlayerData.activeSnack;
            if ((window.PlayerData.items[activeItemId] || 0) > reserve) {
              const snacks = [
                { id: 'Item_020', heal: 10 },
                { id: 'Item_019', heal: 20 },
                { id: 'Item_018', heal: 40 }
              ];
              const snackDef = snacks.find(sx => sx.id === activeItemId);
              if (snackDef) {
                window.PlayerData.items[activeItemId]--;
                stats.condition = Math.min(100, stats.condition + snackDef.heal);
                if (window.updateSnackBasketUI) window.updateSnackBasketUI();
                if (window.openSnackModal && document.getElementById('snack-modal').classList.contains('show')) {
                  window.openSnackModal(); // refresh UI if open
                }
              }
            }
          }
          // --------------------------
        }
      }
    });
    
    // Auto-fill empty
    if(s.active.includes(null)) {
      s.active.forEach((cid, index) => {
        if(!cid) {
          let bestIdx = -1, bestStat = -1;
          s.rest.forEach((rcid, ridx) => {
            if(rcid) {
              const rstats = PlayerData.characterStats[rcid];
              if((rstats.condition || 100) >= 100) {
                const rchar = GameData.characters ? GameData.characters.find(c => c.Character_ID === rcid) : null;
                const rval = rchar ? window.getCharMgmtStat(rchar.Character_ID, type.stat) : 0;
                if(rval > bestStat) { bestStat = rval; bestIdx = ridx; }
              }
            }
          });
          if(bestIdx !== -1) {
            s.active[index] = s.rest[bestIdx];
            s.rest[bestIdx] = null;
            needsUIUpdate = true;
          }
        }
      });
    }
    
    // 2. Production loop
    if (s.craftQueue > 0 && s.craftItem) {
      let totalStat = 0;
      let activeCount = 0;
      s.active.forEach(cid => {
        if(cid) {
          const cond = PlayerData.characterStats[cid]?.condition ?? 100;
          if(cond > 0) {
            let statBoost = window.getCharMSkillEffect ? window.getCharMSkillEffect(cid, 'Self_Prod', type.id) : 0;
            totalStat += (5 + window.getCharOfficeStat(cid, type.id) + statBoost);
            activeCount++;
          }
        }
      });
    
      
      const recipe = getRecipe(type.id, s.craftItem);
      if (recipe && recipe.req > 0) {
        const speed = totalStat; 
        // 1 stat = 1 production per second
        s.progress += (speed * dtSeconds);
        
        let itemsProduced = false;
        let wasGreat = false;
        while (s.progress >= recipe.req && s.craftQueue > 0) {
          s.progress -= recipe.req;
          s.craftQueue--;
          itemsProduced = true;
          
          let greatBoost = 0;
          s.active.forEach(cid => {
              if (cid && (PlayerData.characterStats[cid]?.condition ?? 100) > 0) {
                  greatBoost += window.getCharMSkillEffect ? window.getCharMSkillEffect(cid, 'Self_Great', type.id) : 0;
              }
          });
          let greatChance = Math.min(100, 5 + (totalStat * 1) + greatBoost);
          let isGreat = (Math.random() * 100 < greatChance);
          if (isGreat) wasGreat = true;
          let mult = isGreat ? 2 : 1;
          
          const yieldId = recipe.yields.id;
          const yieldAmt = recipe.yields.count * mult;
          
          PlayerData.office.supplies[yieldId] = (PlayerData.office.supplies[yieldId] || 0) + yieldAmt;
          needsUIUpdate = true;
        }
        
        if (itemsProduced) {
          if (window.spawnFloatingText && document.getElementById('scene-11').classList.contains('active')) {
            window.spawnFloatingText('office-prog-txt-' + type.id, wasGreat ? '[ 작업 대성공! ]' : '[ 작업 완료 ]', wasGreat ? 'great' : 'normal');
          }
        }
        
        if (s.craftQueue === 0) {
          s.progress = 0;
          s.craftItem = null;
        }
      }
    }
  });
  
  // 1.5. Office Lounge (휴게공간) Condition Recovery:
  // Provides 50% higher condition recovery rate than other rest areas (1.5x)
  if (PlayerData.office && PlayerData.office.lounge && Array.isArray(PlayerData.office.lounge.rest)) {
    PlayerData.office.lounge.rest.forEach(cid => {
      if (cid) {
        deployedChars.add(cid);
        const stats = PlayerData.characterStats[cid];
        if (stats) {
          if (stats.condition === undefined) stats.condition = 100;
          let selfRecoverBoost = (window.getCharMSkillEffect ? window.getCharMSkillEffect(cid, 'Self_Cond_Recover', 'ALL') : 0) / 60;
          let actualRecover = (mgmtA + selfRecoverBoost) * 1.5; // 50% higher recovery rate!
          stats.condition = Math.min(100, stats.condition + (actualRecover * dtSeconds));
          
          // --- AUTO CONSUME SNACK ---
          const reserve = Number(window.PlayerData.snackReserve || 0);
          if (window.PlayerData.activeSnack && stats.condition <= 5) {
            const activeItemId = window.PlayerData.activeSnack;
            if ((window.PlayerData.items[activeItemId] || 0) > reserve) {
              const snacks = [
                { id: 'Item_020', heal: 10 },
                { id: 'Item_019', heal: 20 },
                { id: 'Item_018', heal: 40 }
              ];
              const snackDef = snacks.find(sx => sx.id === activeItemId);
              if (snackDef) {
                window.PlayerData.items[activeItemId]--;
                stats.condition = Math.min(100, stats.condition + snackDef.heal);
                if (window.updateSnackBasketUI) window.updateSnackBasketUI();
                if (window.openSnackModal && document.getElementById('snack-modal').classList.contains('show')) {
                  window.openSnackModal();
                }
              }
            }
          }
          // --------------------------
        }
      }
    });
  }
  
  // Idle characters condition
  // Actually, idle logic runs in tickStudio for ALL idle characters. 
  // We need to ensure we don't double count idle recovery.
  // tickStudio runs globally for condition!
  // Let's modify tickStudio to also add OFFICE deployed chars to deployedChars set.
  // Wait, I can just rely on the tickStudio's idle logic if I patch it.
  
  // Update UI throttled
  const now = Date.now();
  if (now - lastOfficeTickUpdate > 1000 || needsUIUpdate) {
    if(document.getElementById('scene-11').classList.contains('active')) {
      if (needsUIUpdate) {
        updateOfficeUI();
      } else {
        if(window.updateOfficeProgressUI) window.updateOfficeProgressUI();
      }
    }
    lastOfficeTickUpdate = now;
  }
}

window.updateOfficeProgressUI = function() {
  OFFICE_TYPES.forEach(type => {
    const state = PlayerData.office[type.id];
    const fill = document.getElementById(`office-prog-fill-${type.id}`);
    const txt = document.getElementById(`office-prog-txt-${type.id}`);
    const status = document.getElementById(`office-prog-status-${type.id}`);
    const left = document.getElementById(`office-prog-left-${type.id}`);
    if (!fill || !txt) return;
    
    let recipe = null;
    let gaugePct = 0;
    
    if (state.craftItem && state.craftQueue > 0) {
      recipe = getRecipe(type.id, state.craftItem);
      if (recipe && recipe.req > 0) {
        gaugePct = Math.min(100, (state.progress / recipe.req) * 100);
      }
      fill.style.width = gaugePct + '%';
      fill.style.background = '#3498db';
      txt.innerHTML = `${gaugePct.toFixed(1)}% (${Math.floor(state.progress)} / ${recipe ? recipe.req : 0})`;
      if(status) status.innerHTML = (type.id === 'dismantle' ? '분해중' : '제작중');
      if(left) left.innerHTML = `잔여: ${state.craftQueue}회`;
    } else {
      fill.style.width = '0%';
      fill.style.background = '#7f8c8d';
      txt.innerHTML = '';
      if(status) status.innerHTML = '대기중';
      if(left) left.innerHTML = '';
    }
  });
};


window.removeOfficeChar = function(deptId, slotType, index) {
  PlayerData.office[deptId][slotType][index] = null;
  updateOfficeUI();
};

window.showOfficeCharTooltip = function(charId, deptId, slotType) {
  let ct = document.getElementById('char-tooltip-container');
  if (!ct) {
    ct = document.createElement('div');
    ct.id = 'char-tooltip-container';
    ct.style.position = 'fixed';
    ct.style.background = 'rgba(15, 20, 25, 0.95)';
    ct.style.border = '1px solid #34495e';
    ct.style.borderRadius = '8px';
    ct.style.padding = '12px';
    ct.style.color = '#ecf0f1';
    ct.style.fontSize = '12px';
    ct.style.boxShadow = '0 4px 15px rgba(0,0,0,0.5)';
    ct.style.pointerEvents = 'none';
    ct.style.zIndex = '99999';
    ct.style.lineHeight = '1.6';
    ct.style.whiteSpace = 'nowrap';
    document.body.appendChild(ct);
    
    document.addEventListener('mousemove', (e) => {
      if (ct.style.display === 'block') {
        let x = e.clientX + 15;
        let y = e.clientY + 15;
        if (x + ct.offsetWidth > window.innerWidth) x = e.clientX - ct.offsetWidth - 15;
        if (y + ct.offsetHeight > window.innerHeight) y = e.clientY - ct.offsetHeight - 15;
        ct.style.left = x + 'px';
        ct.style.top = y + 'px';
      }
    });
  }

  const char = GameData.characters.find(c => c.Character_ID === charId);
  if (!char) return;
  
  const cond = PlayerData.characterStats[charId]?.condition ?? 100;
  let condRateHtml = '';
  
  let prodHtml = '';
  
  if (slotType === 'active') {
    let selfDrainReduce = (window.getCharMSkillEffect ? window.getCharMSkillEffect(charId, 'Self_Cond_Drain', 'ALL') : 0);
    let actualDrainPerMin = Math.max(0, getMgmtBRate() - selfDrainReduce);
    const rateH = (actualDrainPerMin * 60).toFixed(1);
    condRateHtml = `시간당 소모: <span style="color:#e74c3c;">-${rateH}</span>`;
    
    const baseVal = window.getCharOfficeStat(charId, deptId);
    const statBoost = window.getCharMSkillEffect ? window.getCharMSkillEffect(charId, 'Self_Prod', deptId) : 0;
    const statVal = 5 + baseVal + statBoost;
    const prodH = statVal * 3600;
    
    const state = PlayerData.office[deptId];
    if (deptId === 'kitchen' || deptId === 'dismantle') {
        const starVal = PlayerData.characterStats[charId]?.star || char.Character_Star || 1;
        let tierVal = 1;
        if (char.Character_Tier === 'SR') tierVal = 2;
        if (char.Character_Tier === 'SSR') tierVal = 3;
        prodHtml = `
        <div style="margin-top:8px; border-top:1px solid rgba(255,255,255,0.2); padding-top:8px;">
            성급 보너스 : ${starVal}단계<br>
            티어 보너스 : ${tierVal}단계<br>
            시간당 생산력: <span style="color:#3498db;">${prodH.toLocaleString()}</span>
        `;
    } else {
        prodHtml = `
        <div style="margin-top:8px; border-top:1px solid rgba(255,255,255,0.2); padding-top:8px;">
            시간당 생산력: <span style="color:#3498db;">${prodH.toLocaleString()}</span>
        `;
    }
    
    const greatBoost = window.getCharMSkillEffect ? window.getCharMSkillEffect(charId, 'Self_Great', deptId) : 0;
    let greatHtml = greatBoost > 0 ? `<br>대성공 확률 보너스: <span style="color:#e67e22;">+${greatBoost}%</span>` : '';
    
    if (state.craftItem && state.craftQueue > 0) {
        const recipe = getRecipe(deptId, state.craftItem);
        if (recipe && recipe.req > 0) {
            const itemH = (prodH / recipe.req * (recipe.yields?.count || 1)).toFixed(1);
            const itemName = GameData.items?.find(it => it.Item_ID === state.craftItem)?.Item_Name || '알수없음';
            prodHtml += `<br>시간당 생산: <span style="color:#f1c40f;">${itemH} ${itemName}</span>${greatHtml}`;
        }
    } else {
        prodHtml += `<br><span style="color:#7f8c8d;">현재 아이템 작업 없음</span>${greatHtml}`;
    }
    prodHtml += `</div>`;
  } else if (slotType === 'rest') {
    let selfRecoverBoost = (window.getCharMSkillEffect ? window.getCharMSkillEffect(charId, 'Self_Cond_Recover', 'ALL') : 0);
    let baseRate = (window.getMgmtARate ? window.getMgmtARate() : 3);
    let mult = (deptId === 'lounge') ? 1.5 : 1.0;
    let actualRecoverPerMin = (baseRate + selfRecoverBoost) * mult;
    const rateH = (actualRecoverPerMin * 60).toFixed(1);
    const extraNotice = (deptId === 'lounge') ? ' <span style="color:#2ecc71; font-weight:bold;">(+50% 휴게 보너스)</span>' : '';
    condRateHtml = `시간당 회복: <span style="color:#2ecc71;">+${rateH}</span>${extraNotice}`;
  } else {
    let selfRecoverBoost = (window.getCharMSkillEffect ? window.getCharMSkillEffect(charId, 'Self_Cond_Recover', 'ALL') : 0);
    let actualRecoverPerMin = ((window.getMgmtARate ? window.getMgmtARate() : 3) + selfRecoverBoost) * 0.5;
    const rateH = (actualRecoverPerMin * 60).toFixed(1);
    condRateHtml = `대기열 회복 (휴식의 50%): <span style="color:#2ecc71;">+${rateH}</span>`;
  }
  
  let statsHtml = '<div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px 12px; margin-top:10px; background:rgba(0,0,0,0.3); padding:8px 12px; border-radius:5px; text-align:center;">';
  
  let targetStat = null;
  const oType = window.OFFICE_TYPES ? window.OFFICE_TYPES.find(t => t.id === deptId) : null;
  if (oType && oType.stat) targetStat = oType.stat;
  else if (typeof OFFICE_TYPES !== 'undefined') {
    const fallback = OFFICE_TYPES.find(t => t.id === deptId);
    if (fallback && fallback.stat) targetStat = fallback.stat;
  }
  
  // Need to get STUDIO_TYPES which are global
  if (window.STUDIO_TYPES) {
      window.STUDIO_TYPES.forEach(t => {
        if (t.isMgmt) return;
        const val = window.getCharMgmtStat(char.Character_ID, t.stat);
        const isCurrent = (t.stat === targetStat) && slotType === 'active';
        const color = isCurrent ? '#f1c40f' : '#ecf0f1';
        statsHtml += `<div style="color:${color}; font-weight:${isCurrent?'bold':'normal'};">${t.emoji} ${val}</div>`;
      });
  }
  statsHtml += '</div>';

  let tierColor = '#ecf0f1';
  if (char.Character_Tier === 'SSR') tierColor = '#ff9ff3'; 
  else if (char.Character_Tier === 'SR') tierColor = '#f1c40f'; 
  else if (char.Character_Tier === 'R') tierColor = '#87ceeb'; 

  ct.innerHTML = `
    <div style="padding-bottom:8px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:flex-end; gap: 20px;">
      <span style="font-size:14px; font-weight:bold; color:#fff;">${char.Character_Name}</span>
      <span style="font-size:11px; color:${tierColor}; font-weight:bold;">${char.Character_Tier}</span>
    </div>
    
    <div style="font-size:11px; color:#bdc3c7; text-align:right; margin-top:-8px; margin-bottom:8px;">
      ★${PlayerData.characterStats[charId]?.star || char.Character_Star || 1}
    </div>

    <div style="margin-bottom:8px; border-top:1px solid rgba(255,255,255,0.2); padding-top:8px;">
      컨디션: <strong>${cond.toFixed(1)}</strong> / 100
      <div style="margin-top:4px; font-size:11px;">${condRateHtml}</div>
    </div>
    ${typeof prodHtml !== 'undefined' ? prodHtml : ''}
    ${statsHtml}
  `;
  
  // --- ADD M_SKILL INFO ---
  const pChar = window.PlayerData.characterStats[charId] || {};
  const starVal = pChar.star || char.Character_Star || 1;
  
  if (GameData.m_skill && char.Character_M_Skill) {
      const mSkill = GameData.m_skill.find(s => s.M_Skill_ID === char.Character_M_Skill);
      if (mSkill) {
          const sType = mSkill.M_Skill_Effect_Type;
          const sRoom = mSkill.M_Skill_Target_Room;
          const currentRoom = deptId;
          
          let isActive = false;
          if (sRoom === 'ALL' || sRoom === currentRoom) {
              if (sType === 'Self_Cond_Recover') {
                  if (slotType === 'rest') isActive = true;
              } else {
                  if (slotType === 'active') isActive = true;
              }
          }
          
          let color = isActive ? '#3498db' : '#95a5a6'; 
          let name = mSkill.M_Skill_Name || char.Character_M_Skill;
          
          if (starVal < 2) {
              ct.innerHTML += `<div style="margin-top: 8px; border-top: 1px dashed #7f8c8d; padding-top: 5px; opacity: 0.5; filter: grayscale(100%);">
                  <div style="font-weight: bold; color: #e74c3c; font-size: 11px;">🔒 [미해금] ${name} (★2 해금)</div>
                  <div style="font-size: 11px; color: #95a5a6; margin-top: 2px;">${mSkill.M_Skill_Desc}</div>
              </div>`;
          } else {
              ct.innerHTML += `<div style="margin-top: 8px; border-top: 1px dashed #7f8c8d; padding-top: 5px;">
                  <div style="font-weight: bold; color: ${color}; font-size: 11px;">✨ [패시브] ${name}</div>
                  <div style="font-size: 11px; color: ${color}; margin-top: 2px;">${mSkill.M_Skill_Desc}</div>
              </div>`;
          }
      }
  }
        
  ct.style.display = 'block';
}

window.hideOfficeCharTooltip = function() {
  const ct = document.getElementById('char-tooltip-container');
  if (ct) ct.style.display = 'none';
}

setInterval(() => { if (window.updateSnackBasketUI && window.PlayerData) window.updateSnackBasketUI(); }, 1000);
