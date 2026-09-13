import { GameData, PlayerData } from './state.js?v=004276';

// Constants
const STUDIO_TYPES = [
  { id: 'game', name: '게임방송', emoji: '🎮', stat: 'Character_M_Game', req: 5000, item: 'Item_005', activeSlots: 3, restSlots: 5 },
  { id: 'talk', name: '잡담방송', emoji: '💬', stat: 'Character_M_Talk', req: 1200, item: 'Item_008', activeSlots: 3, restSlots: 5 },
  { id: 'sing', name: '노래방송', emoji: '🎤', stat: 'Character_M_Sing', req: 50000, item: 'Item_009', activeSlots: 3, restSlots: 5 },
  { id: 'sexy', name: 'ASMR', emoji: '💋', stat: 'Character_M_Sexy', req: 20000, item: 'Item_010', activeSlots: 3, restSlots: 5 },
  { id: 'plan', name: '기획방송', emoji: '💡', stat: 'Character_M_Plan', req: 1000, item: 'Item_002', activeSlots: 3, restSlots: 5 },
  { id: 'passion', name: '내구방송', emoji: '🔥', stat: 'Character_M_Passion', req: 90000, item: 'Item_004', activeSlots: 3, restSlots: 5 },
  { id: 'mgmtA', name: '매니지먼트A', emoji: '🏢', stat: null, req: 0, item: null, activeSlots: 1, restSlots: 0, isMgmt: true },
  { id: 'mgmtB', name: '매니지먼트B', emoji: '🏢', stat: null, req: 0, item: null, activeSlots: 1, restSlots: 0, isMgmt: true }
];

function getChar(id) {
  return GameData.characters.find(c => c.Character_ID === id);
}

function getTierVal(char) {
  const t = char.Character_Tier;
  if (t === 'SSR') return 3;
  if (t === 'SR') return 2;
  return 1;
}

function getMgmtStep(charId) {
  if (!charId) return 0;
  const char = getChar(charId);
  const pChar = PlayerData.characterStats[charId];
  if (!char || !pChar) return 0;
  let rarityVal = 1;
  if (char.Character_Tier === 'SR') rarityVal = 2;
  else if (char.Character_Tier === 'SSR') rarityVal = 3;
  const starVal = pChar.star || 1;
  return Math.min(6, rarityVal + starVal);
}

function getMgmtARate() {
  const sData = PlayerData.studio['mgmtA'];
  if (!sData) return 0.20;
  const activeChar = sData.active[0];
  const step = getMgmtStep(activeChar);
  const rates = [0.20, 0.22, 0.24, 0.26, 0.28, 0.29, 0.30];
  let rate = rates[step] || 0.20;
  if (activeChar && window.getCharMSkillEffect) {
      rate += window.getCharMSkillEffect(activeChar, 'Global_Cond_Recover', 'mgmtA');
  }
  return rate;
}

function getMgmtBRate() {
  const sData = PlayerData.studio['mgmtB'];
  if (!sData) return 0.50;
  const activeChar = sData.active[0];
  const step = getMgmtStep(activeChar);
  const rates = [0.50, 0.48, 0.46, 0.44, 0.42, 0.40, 0.38];
  let rate = rates[step] || 0.50;
  if (activeChar && window.getCharMSkillEffect) {
      rate -= window.getCharMSkillEffect(activeChar, 'Global_Cond_Drain', 'mgmtB');
  }
  return Math.max(0, rate);
}

function getRewardAmt(itemId) {
  if (itemId === 'Item_002') return 1000;
  if (itemId === 'Item_008') return 3;
  return 1;
}

function renderStudioUI() {
  try {
  const cMain = document.getElementById('studio-grid-main');
  const cMgmt = document.getElementById('studio-grid-mgmt');
  if (!cMain || !cMgmt) return;
  cMain.innerHTML = '';
  cMgmt.innerHTML = '';
  
  STUDIO_TYPES.forEach(type => {
    const sData = PlayerData.studio[type.id];
    
    let itemIcon = '';
    if (!type.isMgmt && Array.isArray(GameData.items)) {
      const itemData = GameData.items.find(i => i.Item_ID === type.item);
      if (itemData && itemData.Item_Icon) {
        const amt = getRewardAmt(type.item);
        itemIcon = `
          <div style="position:relative; margin-right:10px; width:36px; height:36px; cursor:help;" onmouseenter="showItemTooltip(event, '${type.item}')" onmouseleave="hideItemTooltip()">
            <img src="${itemData.Item_Icon}" style="width:100%; height:100%; border-radius:4px;">
            <span style="position:absolute; bottom:-6px; right:-6px; font-size:10px; color:#f1c40f; font-weight:bold; background:rgba(0,0,0,0.8); padding:0 3px; border-radius:3px;">x${amt}</span>
          </div>`;
      }
    }

    const card = document.createElement('div');
    card.className = 'studio-card';
    
    let headerHtml = '';
    if (type.isMgmt) {
      headerHtml = `
      <div class="studio-header" style="flex-direction: column; align-items: stretch; gap: 5px;">
        <div class="studio-title"><span class="studio-emoji">${type.emoji}</span> ${type.name}</div>
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size: 0.8em; color: #3498db;">활성화 : <span id="mgmt-step-${type.id}">0</span> 단계</span>
          <button class="studio-info-btn">?
            <div class="studio-tooltip" id="tooltip-${type.id}">효과: 없음</div>
          </button>
        </div>
      </div>`;
    } else {
      headerHtml = `
      <div class="studio-header">
        <div class="studio-title"><span class="studio-emoji">${type.emoji}</span> ${type.name}</div>
        <button class="studio-info-btn">?
          <div class="studio-tooltip" id="tooltip-${type.id}">합산 스탯: 0<br>대성공 확률: 10%<br>시간당 생산: 0</div>
        </button>
      </div>`;
    }
    
    card.innerHTML = `
      ${headerHtml}
      ${!type.isMgmt ? `<div style="display: flex; align-items: center; margin-bottom: 0px;">
        ${itemIcon}
        <div style="flex:1; background:#1e272e; border-radius:5px; height:15px; position:relative; overflow:hidden; border:1px solid #7f8c8d; box-shadow:none;">
          <div id="prog-fill-${type.id}" style="width:0%; height:100%; background:#2ecc71; transition:width 0.2s;"></div>
          <div id="prog-txt-${type.id}" style="position:absolute; top:0; left:0; width:100%; text-align:center; font-size:10px; color:white; font-weight:bold; line-height:15px; text-shadow:1px 1px 1px black;">[ 0% ]</div>
        </div>
      </div>` : ''}
      
      <div class="studio-slots" style="display:flex; flex-direction:column; gap:12px; margin-top:-5px;">
        <div class="studio-slots-row" id="active-slots-${type.id}"></div>
        ${!type.isMgmt ? `
        <div class="studio-slots-row" id="rest-slots-${type.id}"></div>
        ` : ''}
      </div>
    `;
    
    if (type.isMgmt) cMgmt.appendChild(card);
    else cMain.appendChild(card);
  });
  
  updateTooltips();
  } catch (e) { document.getElementById("init-status-text").innerHTML += "<br><span style=\"color:red;\">renderStudioUI Error: " + e.stack + "</span>"; console.error(e); }
}

function renderSlots(studioId, slotType, count) {
  const container = document.getElementById(`${slotType}-slots-${studioId}`);
  if (!container) return;
  container.innerHTML = '';
  const arr = PlayerData.studio[studioId][slotType] || [];
  
  for (let i = 0; i < count; i++) {
    const slot = document.createElement('div');
    slot.className = 'studio-slot';
    
    const charId = arr[i];
    if (charId) {
      const char = getChar(charId);
      if (char) {
        const cond = PlayerData.characterStats[charId]?.condition ?? 100;
        let condColor = '#2ecc71';
        if (cond < 70) condColor = '#f1c40f';
        if (cond < 30) condColor = '#e74c3c';
        
        const typeInfo = STUDIO_TYPES.find(t => t.id === studioId);
        const statVal = (typeInfo && !typeInfo.isMgmt) ? (window.getCharMgmtStat(char.Character_ID, typeInfo.stat)) : '';
        const statText = (typeInfo && !typeInfo.isMgmt) ? `${typeInfo.emoji} ${statVal}` : '';
        const stateIcon = slotType === 'active' ? '📺' : '💤';
        
        slot.innerHTML = `
          <div class="studio-slot-top-bar">
            <span>${stateIcon}</span>
            <span>${statText}</span>
          </div>
          <div class="studio-slot-img" style="background-image:url('${char.Character_Image_Full}')">
            <div class="studio-slot-hover-overlay">배치 해제</div>
            <div class="studio-cond-text">${Math.floor(cond)}</div>
            <div class="studio-cond-bar-wrap">
              <div class="studio-cond-bar" style="width:${cond}%; background:${condColor};"></div>
            </div>
          </div>
        `;
      }
    } else {
      slot.innerHTML = `
        <div class="studio-slot-top-bar" style="background:transparent; border:none; height:16px;"></div>
        <div class="studio-slot-img" style="display:flex; align-items:center; justify-content:center; color:rgba(255,255,255,0.3); font-size:1.5em; height:50px;">+</div>
      `;
    }
    
    slot.addEventListener('click', () => {
      if (charId) {
        removeChar(studioId, slotType, i); hideCharTooltip();
      } else {
        openRosterModal(studioId, slotType, i); hideCharTooltip();
      }
    });
    
    
    if (charId) {
      slot.addEventListener('mouseenter', () => showCharTooltip(charId, studioId, slotType));
      slot.addEventListener('mouseleave', hideCharTooltip);
    }
    container.appendChild(slot);

  }
}

function openRosterModal(studioId, slotType, index) {
  const modal = document.getElementById('studio-roster-modal');
  if (!modal) return;
  modal.classList.add('show');
  
  const container = document.getElementById('studio-roster-list-modal');
  container.innerHTML = '';
  
  const typeInfo = STUDIO_TYPES.find(t => t.id === studioId);
  const isMgmt = typeInfo ? typeInfo.isMgmt : false;
  
  const allChars = GameData.characters.filter(c => PlayerData.characterStats[c.Character_ID]);
  const rarityOrder = { 'SSR': 3, 'SR': 2, 'R': 1 };
  
  allChars.sort((a, b) => {
    const ra = rarityOrder[a.Character_Tier] || 0;
    const rb = rarityOrder[b.Character_Tier] || 0;
    if (ra !== rb) return rb - ra;
    
    if (!isMgmt) {
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
      container.appendChild(header);
    }
    
    const charId = char.Character_ID;
    
    let depStudioId = null;
    let depSlotType = null;
    let isOffice = false;
    
    for (const t of STUDIO_TYPES) {
      const st = PlayerData.studio[t.id];
      if (st.active && st.active.includes(charId)) { depStudioId = t.id; depSlotType = 'active'; break; }
      if (st.rest && st.rest.includes(charId)) { depStudioId = t.id; depSlotType = 'rest'; break; }
    }
    
    if (!depStudioId && PlayerData.office) {
      // Check office types
      for (const tId in PlayerData.office) {
        if (tId === 'supplies' || tId === 'donations') continue;
        const st = PlayerData.office[tId];
        if (st.active && st.active.includes(charId)) { depStudioId = tId; depSlotType = 'active'; isOffice = true; break; }
        if (st.rest && st.rest.includes(charId)) { depStudioId = tId; depSlotType = 'rest'; isOffice = true; break; }
      }
    }
    
    const div = document.createElement('div');
    div.className = 'studio-roster-char';
    div.style.height = '76px'; // EXPLICIT HEIGHT TO FIX GRID
    
    const cond = PlayerData.characterStats[charId]?.condition ?? 100;
    let condColor = '#2ecc71';
    if (cond < 70) condColor = '#f1c40f';
    if (cond < 30) condColor = '#e74c3c';
    
    const statVal = (!isMgmt) ? (window.getCharMgmtStat(char.Character_ID, typeInfo.stat)) : '';
    const statText = (!isMgmt) ? `${typeInfo.emoji} ${statVal}` : '';
    
    let stateText = '대기중';
    let stateIcon = '';
    if (depStudioId) {
      if (typeof isOffice !== 'undefined' && isOffice) {
         stateIcon = depSlotType === 'active' ? '⚡' : '💤';
         stateText = depSlotType === 'active' ? '작업중' : '휴식중';
      } else {
         stateIcon = depSlotType === 'active' ? '📺' : '💤';
         stateText = depSlotType === 'active' ? '방송중' : '휴식중';
      }
    }
    
    const topBarHtml = `
      <div class="studio-slot-top-bar" style="background:${depStudioId ? '#e67e22' : '#2c3e50'}; justify-content:space-between;">
        <span>${stateIcon} ${stateText}</span>
        <span>${statText}</span>
      </div>
    `;
    
    div.innerHTML = `
      ${topBarHtml}
      <div class="studio-roster-img" style="background-image:url('${char.Character_Image_Full}')">
        ${depStudioId ? '<div style="position:absolute; inset:0; background:rgba(0,0,0,0.4);"></div>' : ''}
        <div class="studio-cond-text">${Math.floor(cond)}</div>
        <div class="studio-cond-bar-wrap">
          <div class="studio-cond-bar" style="width:${cond}%; background:${condColor};"></div>
        </div>
      </div>
    `;
    
    div.addEventListener('click', () => {
      assignChar(charId, studioId, slotType, index);
      modal.classList.remove('show');
      window.hideRosterTooltip();
    });
    
    div.addEventListener('mouseenter', (e) => window.showRosterTooltip(e, charId, studioId));
    div.addEventListener('mouseleave', window.hideRosterTooltip);
    
    container.appendChild(div);
  });
}

function assignChar(charId, studioId, slotType, index) {
  if (charId && PlayerData.characterStats && PlayerData.characterStats[charId]) {
    if (PlayerData.characterStats[charId].condition === undefined) {
      PlayerData.characterStats[charId].condition = 100;
    }
  }
  STUDIO_TYPES.forEach(type => {
    const s = PlayerData.studio[type.id];
    let idx = s.active.indexOf(charId);
    if (idx !== -1) s.active[idx] = null;
    if (s.rest) {
      idx = s.rest.indexOf(charId);
      if (idx !== -1) s.rest[idx] = null;
    }
  });
  
  if (PlayerData.office) {
    Object.keys(PlayerData.office).forEach(typeId => {
      if (typeId === 'supplies') return;
      const o = PlayerData.office[typeId];
      if (o && o.active) {
          let idx = o.active.indexOf(charId);
          if (idx !== -1) o.active[idx] = null;
      }
      if (o && o.rest) {
          let idx = o.rest.indexOf(charId);
          if (idx !== -1) o.rest[idx] = null;
      }
    });
    if (window.updateOfficeUI) window.updateOfficeUI();
  }

  
  PlayerData.studio[studioId][slotType][index] = charId;
  refreshStudioUI();
}

function removeChar(studioId, slotType, index) {
  PlayerData.studio[studioId][slotType][index] = null;
  refreshStudioUI();
}

window.refreshStudioUI = refreshStudioUI;
function refreshStudioUI() {
  STUDIO_TYPES.forEach(type => {
    renderSlots(type.id, 'active', type.activeSlots);
    if (!type.isMgmt) renderSlots(type.id, 'rest', type.restSlots);
  });
  updateTooltips();
}

function updateTooltips() {
  STUDIO_TYPES.forEach(type => {
    const s = PlayerData.studio[type.id];
    const tooltip = document.getElementById(`tooltip-${type.id}`);
    if (!tooltip) return;
    
    if (type.isMgmt) {
      const step = getMgmtStep(s.active[0]);
      const stepEl = document.getElementById(`mgmt-step-${type.id}`);
      if (stepEl) stepEl.textContent = step;
      
      if (type.id === 'mgmtA') tooltip.innerHTML = `효과: 휴식 회복량 증가<br>분당 ${getMgmtARate()} 회복 (Step ${step})`;
      else tooltip.innerHTML = `효과: 작업 소모량 감소<br>분당 ${getMgmtBRate()} 소모 (Step ${step})`;
    } else {
      let totalStat = 0;
      let rawStat = 0;
      let activeCount = 0;
      s.active.forEach((cid, index) => {
        if (cid) {
          const char = getChar(cid);
          if (char) {
             const base = window.getCharMgmtStat(char.Character_ID, type.stat);
             const cond = PlayerData.characterStats[cid]?.condition ?? 100;
             if (cond > 0) {
                 let statBoost = window.getCharMSkillEffect ? window.getCharMSkillEffect(cid, 'Self_Prod', type.id) : 0;
                 rawStat += (base + statBoost);
                 totalStat += (5 + base + statBoost);
                 activeCount++;
             }
          }
        }
      });
  
      let greatBoost = 0;
      s.active.forEach(cid => {
          if (cid && (PlayerData.characterStats[cid]?.condition ?? 100) > 0) {
              greatBoost += window.getCharMSkillEffect ? window.getCharMSkillEffect(cid, 'Self_Great', type.id) : 0;
          }
      });
      const greatChance = Math.min(100, 10 + (totalStat * 2) + greatBoost);
      const prodPerSec = totalStat; 
      tooltip.innerHTML = `${type.emoji} 합산 스탯: ${rawStat}<br>대성공 확률: ${greatChance}%<br>게이지 증가량: 초당 ${prodPerSec}`;
    }
  });
}

function updateProgress() {
  STUDIO_TYPES.forEach(type => {
    if (type.isMgmt) return;
    const s = PlayerData.studio[type.id];
    const fill = document.getElementById(`prog-fill-${type.id}`);
    const txt = document.getElementById(`prog-txt-${type.id}`);
    if (!fill || !txt) return;
    
    let currentAmt = PlayerData.studio.donations?.[type.item] || 0;
    let limit = 100;
    if (type.item === 'Item_002') limit = 500000;
    else if (type.item === 'Item_008') limit = 500;
    
    if (currentAmt >= limit) {
       fill.style.width = '100%';
       fill.style.background = '#7f8c8d';
       txt.textContent = '[ 작업중단 ]';
    } else {
       let pct = (s.progress / type.req) * 100;
       pct = Math.min(100, Math.max(0, pct));
       fill.style.width = pct + '%';
       fill.style.background = '#3498db';
       txt.textContent = `[ ${Math.floor(pct)}% ]    ${Math.floor(s.progress)} / ${type.req}`;
    }
  });
}

function renderDonationBox() {
  window.renderDonationBox = renderDonationBox;
  const container = document.getElementById('studio-donation-list');
  if (!container) return;
  container.innerHTML = '';
  
  if (!PlayerData.studio.donations) PlayerData.studio.donations = {};
  
  let hasItems = false;
  for (const itemId in PlayerData.studio.donations) {
    const amt = PlayerData.studio.donations[itemId];
    if (amt > 0) {
      hasItems = true;
      const itemData = Array.isArray(GameData.items) ? GameData.items.find(i => i.Item_ID === itemId) : null;
      if (itemData) {
        let limit = 100;
        if (itemId === 'Item_002') limit = 500000;
        else if (itemId === 'Item_008') limit = 500;
        const isMax = amt >= limit;
        
        const div = document.createElement('div');
        div.className = 'studio-donation-item';
        div.style.border = isMax ? '2px solid #e74c3c' : '';
        div.setAttribute('onmouseenter', `window.showItemTooltip(event, '${itemId}')`);
        div.setAttribute('onmouseleave', `window.hideItemTooltip()`);
        div.innerHTML = `
          <img src="${itemData.Item_Icon}" style="pointer-events:none;">
          <span style="pointer-events:none;">${itemData.Item_Name} <span style="color:${isMax ? '#e74c3c' : '#f1c40f'};">x${amt}</span></span>
        `;
        container.appendChild(div);
      }
    }
  }
  
  if (!hasItems) {
    container.innerHTML = '<div style="color:rgba(255,255,255,0.5); text-align:center; padding-top:20px;">적립된 아이템이 없습니다.</div>';
  }
}

// Tick Engine
function tickStudio(dtSeconds) {
  if (dtSeconds <= 0) return;
  if (!PlayerData.studio.donations) PlayerData.studio.donations = {};
  
  const mgmtA = getMgmtARate() / 60; // per second
  const mgmtB = getMgmtBRate() / 60; // per second
  
  // 1. Condition update
  STUDIO_TYPES.forEach(type => {
    const s = PlayerData.studio[type.id];
    
    let isStopped = false;
    if (!type.isMgmt) {
      let limit = 100;
      if (type.item === 'Item_002') limit = 500000;
      else if (type.item === 'Item_008') limit = 500;
      let currentAmt = PlayerData.studio.donations?.[type.item] || 0;
      if (currentAmt >= limit) {
         isStopped = true;
      }
    }
    
    s.active.forEach((cid, index) => {
      if (cid && !type.isMgmt) {
        const stats = PlayerData.characterStats[cid];
        if (stats) {
          if (stats.condition === undefined) stats.condition = 100;
          if (!isStopped) {
            let selfDrainReduce = (window.getCharMSkillEffect ? window.getCharMSkillEffect(cid, 'Self_Cond_Drain', 'ALL') : 0) / 60;
            let actualDrain = Math.max(0, mgmtB - selfDrainReduce);
            stats.condition = Math.max(0, stats.condition - (actualDrain * dtSeconds));
          }
        }
        
        if (stats.condition <= 0) {
          let bestIdx = -1;
          let bestStat = -1;
          let emptyIdx = -1;
          if (s.rest) {
            s.rest.forEach((rcid, ridx) => {
              if (rcid) {
                const rstats = PlayerData.characterStats[rcid];
                if ((rstats.condition || 100) >= 100) {
                  const rchar = getChar(rcid);
                  const rval = window.getCharMgmtStat(rchar.Character_ID, type.stat);
                  if (rval > bestStat) {
                    bestStat = rval;
                    bestIdx = ridx;
                  }
                }
              } else if (emptyIdx === -1) {
                emptyIdx = ridx;
              }
            });
          }
          if (bestIdx !== -1) {
            const temp = s.rest[bestIdx];
            s.rest[bestIdx] = cid;
            s.active[index] = temp; // Note: parent forEach needs to provide index
          } else if (emptyIdx !== -1) {
            s.rest[emptyIdx] = cid;
            s.active[index] = null;
          }
        }
      }
    });
    if (s.rest) {
      s.rest.forEach(cid => {
        if (cid) {
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
    }
    
    // Auto-fill empty active slots
    if (!type.isMgmt && s.active.includes(null)) {
      s.active.forEach((cid, index) => {
        if (!cid) {
          let bestIdx = -1;
          let bestStat = -1;
          if (s.rest) {
            s.rest.forEach((rcid, ridx) => {
              if (rcid) {
                const rstats = PlayerData.characterStats[rcid];
                if ((rstats.condition || 100) >= 100) {
                  const rchar = getChar(rcid);
                  const rval = window.getCharMgmtStat(rchar.Character_ID, type.stat);
                  if (rval > bestStat) {
                    bestStat = rval;
                    bestIdx = ridx;
                  }
                }
              }
            });
          }
          if (bestIdx !== -1) {
            s.active[index] = s.rest[bestIdx];
            s.rest[bestIdx] = null;
          }
        }
      });
    }
  });

  // 1.5 Idle characters (not placed in Studio or Office) condition recovery:
  // Recovers at 50% of the rest slot recovery rate
  const deployedChars = new Set();
  STUDIO_TYPES.forEach(t => {
    const ts = PlayerData.studio && PlayerData.studio[t.id];
    if (ts) {
      if (ts.active) ts.active.forEach(c => { if (c) deployedChars.add(c); });
      if (ts.rest) ts.rest.forEach(c => { if (c) deployedChars.add(c); });
    }
  });

  if (PlayerData.office) {
    Object.keys(PlayerData.office).forEach(k => {
      if (k === 'supplies' || k === 'donations') return;
      const os = PlayerData.office[k];
      if (os) {
        if (os.active) os.active.forEach(c => { if (c) deployedChars.add(c); });
        if (os.rest) os.rest.forEach(c => { if (c) deployedChars.add(c); });
      }
    });
  }

  const baseRestRatePerSec = (typeof window.getMgmtARate === 'function' ? window.getMgmtARate() : 3) / 60;
  if (Array.isArray(PlayerData.characters)) {
    PlayerData.characters.forEach(cid => {
      if (!deployedChars.has(cid)) {
        if (!PlayerData.characterStats) PlayerData.characterStats = {};
        if (!PlayerData.characterStats[cid]) {
          PlayerData.characterStats[cid] = { level: 1, star: 1, exp: 0, bloom: 0, condition: 100 };
        }
        const stats = PlayerData.characterStats[cid];
        if (stats.condition === undefined) stats.condition = 100;
        if (stats.condition < 100) {
          const selfRecoverBoost = (typeof window.getCharMSkillEffect === 'function' ? window.getCharMSkillEffect(cid, 'Self_Cond_Recover', 'ALL') : 0) / 60;
          const idleRate = (baseRestRatePerSec + selfRecoverBoost) * 0.5;
          stats.condition = Math.min(100, stats.condition + (idleRate * dtSeconds));
        }
      }
    });
  }
  
  // 2. Production update
  STUDIO_TYPES.forEach(type => {
    if (type.isMgmt) return;
    
    const s = PlayerData.studio[type.id];
    let totalStat = 0;
    let activeCount = 0;
    s.active.forEach((cid, index) => {
      if (cid) {
        const cond = PlayerData.characterStats[cid]?.condition ?? 100;
        if (cond > 0) {
          const char = getChar(cid);
          totalStat += (5 + (window.getCharMgmtStat(char.Character_ID, type.stat)));
          activeCount++;
        }
      }
    });

    
    if (totalStat > 0) {
      let currentAmt = PlayerData.studio.donations?.[type.item] || 0;
      let limit = 100;
      if (type.item === 'Item_002') limit = 500000;
      else if (type.item === 'Item_008') limit = 500;
      
      if (currentAmt >= limit) {
         s.progress = 0;
      } else {
         s.progress += totalStat * dtSeconds;
      }
      
      let itemsProduced = false;
      let wasGreat = false;
      while (s.progress >= type.req) {
        s.progress -= type.req;
        itemsProduced = true;
        
        let greatBoost = 0;
        s.active.forEach(cid => {
            if (cid && (PlayerData.characterStats[cid]?.condition ?? 100) > 0) {
                greatBoost += window.getCharMSkillEffect ? window.getCharMSkillEffect(cid, 'Self_Great', type.id) : 0;
            }
        });
        const greatChance = 10 + (totalStat * 2) + greatBoost;
        const isGreat = (Math.random() * 100) < greatChance;
        if (isGreat) wasGreat = true;
        
        let rewardAmt = 0;
        if (type.item === 'Item_002') rewardAmt = 1000;
        else if (type.item === 'Item_008') rewardAmt = 3;
        else rewardAmt = 1;
        
        if (isGreat) rewardAmt *= 2; 
        
        let limit = 100;
        if (type.item === 'Item_002') limit = 500000;
        else if (type.item === 'Item_008') limit = 500;
        
        PlayerData.studio.donations[type.item] = Math.min(limit, (PlayerData.studio.donations[type.item] || 0) + rewardAmt);
      }
      
      if (itemsProduced) {
        if (window.spawnFloatingText && document.getElementById('scene-10').classList.contains('active')) {
          window.spawnFloatingText('prog-txt-' + type.id, wasGreat ? '[ 작업 대성공! ]' : '[ 작업 완료 ]', wasGreat ? 'great' : 'normal');
        }
      }
      
      if (itemsProduced) {
        renderDonationBox();
      }
    }
  });
  
  PlayerData.lastStudioUpdate = Date.now();
  refreshStudioUI();
  updateProgress();
}


window.initStudioUI = function() {
  try {
  if (!PlayerData.studio) PlayerData.studio = {};
  STUDIO_TYPES.forEach(type => {
    if (!PlayerData.studio[type.id]) {
      PlayerData.studio[type.id] = {
        active: new Array(type.activeSlots).fill(null),
        rest: type.restSlots > 0 ? new Array(type.restSlots).fill(null) : null,
        progress: 0
      };
    } else {
      if (!PlayerData.studio[type.id].active) PlayerData.studio[type.id].active = new Array(type.activeSlots).fill(null);
      if (!type.isMgmt && !PlayerData.studio[type.id].rest) PlayerData.studio[type.id].rest = new Array(type.restSlots).fill(null);
      
      while (PlayerData.studio[type.id].active.length < type.activeSlots) PlayerData.studio[type.id].active.push(null);
      if (!type.isMgmt) {
        while (PlayerData.studio[type.id].rest.length < type.restSlots) PlayerData.studio[type.id].rest.push(null);
        if (PlayerData.studio[type.id].rest.length > type.restSlots) {
          PlayerData.studio[type.id].rest = PlayerData.studio[type.id].rest.slice(0, type.restSlots);
        }
      }
    }
  });

  renderStudioUI();

  refreshStudioUI();
  renderDonationBox();
  
  const btnCloseModal = document.getElementById('btn-close-studio-roster');
  if (btnCloseModal) {
    btnCloseModal.addEventListener('click', () => {
      document.getElementById('studio-roster-modal').classList.remove('show');
    });
  }
  
  const btnCollect = document.getElementById('btn-collect-donations');
  if (btnCollect) {
    btnCollect.addEventListener('click', () => {
      if (!PlayerData.studio.donations) return;
      let collected = false;
      for (const itemId in PlayerData.studio.donations) {
        const amt = PlayerData.studio.donations[itemId];
        if (amt > 0) {
          PlayerData.items[itemId] = (PlayerData.items[itemId] || 0) + amt;
          PlayerData.studio.donations[itemId] = 0;
          collected = true;
        }
      }
      if (collected) {
        renderDonationBox();
      }
    });
  }
  
  const now = Date.now();
  const last = PlayerData.lastStudioUpdate || now;
  const dt = (now - last) / 1000;
  if (dt > 10) {
    tickStudio(dt);
  }
  PlayerData.lastStudioUpdate = now;
  
  if (!window._studioIntervalStarted) {
    window._studioIntervalStarted = true;
    setInterval(() => {
      try {
        tickStudio(1);
      } catch (e) {
        console.error("tickStudio interval error:", e);
      }
    }, 1000);
  }
  } catch (e) { document.getElementById("init-status-text").innerHTML += "<br><span style=\"color:red;\">initStudioUI Error: " + e.stack + "</span>"; console.error(e); }
}

function showCharTooltip(charId, studioId, slotType) {
  let ct = document.getElementById('char-tooltip');
  if (!ct) {
    ct = document.createElement('div');
    ct.id = 'char-tooltip';
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

  const char = getChar(charId);
  if (!char) return;
  const cond = PlayerData.characterStats[charId]?.condition ?? 100;
  
  const typeInfo = STUDIO_TYPES.find(t => t.id === studioId);
  const isMgmt = typeInfo?.isMgmt;
  
  let condRateHtml = '';
  let prodHtml = '';
  
  if (slotType === 'active' && !isMgmt) {
    let selfDrainReduce = (window.getCharMSkillEffect ? window.getCharMSkillEffect(charId, 'Self_Cond_Drain', 'ALL') : 0); // per min
    let actualDrainPerMin = Math.max(0, getMgmtBRate() - selfDrainReduce);
    const rateH = (actualDrainPerMin * 60).toFixed(1);
    condRateHtml = `시간당 소모: <span style="color:#e74c3c;">-${rateH}</span>`;
    
    const baseVal = window.getCharMgmtStat(char.Character_ID, typeInfo.stat);
    const statBoost = window.getCharMSkillEffect ? window.getCharMSkillEffect(charId, 'Self_Prod', studioId) : 0;
    const statVal = 5 + baseVal + statBoost;
    const prodH = statVal * 3600;
    
    let baseReward = 1;
    if (typeInfo.item === 'Item_002') baseReward = 1000;
    else if (typeInfo.item === 'Item_008') baseReward = 3;
    
    const itemH = (prodH / typeInfo.req * baseReward).toFixed(1);
    const itemName = GameData.items?.find(it => it.Item_ID === typeInfo.item)?.Item_Name || '아이템';
    const greatBoost = window.getCharMSkillEffect ? window.getCharMSkillEffect(charId, 'Self_Great', studioId) : 0;
    let greatHtml = greatBoost > 0 ? `<br>대성공 확률 보너스: <span style="color:#e67e22;">+${greatBoost}%</span>` : '';
    
    prodHtml = `
      시간당 생산력: <span style="color:#3498db;">${prodH.toLocaleString()}</span><br>
      시간당 생산: <span style="color:#f1c40f;">${itemH} ${itemName}</span>${greatHtml}
    `;
  } else if (slotType === 'rest') {
    let selfRecoverBoost = (window.getCharMSkillEffect ? window.getCharMSkillEffect(charId, 'Self_Cond_Recover', 'ALL') : 0); // per min
    let actualRecoverPerMin = getMgmtARate() + selfRecoverBoost;
    const rateH = (actualRecoverPerMin * 60).toFixed(1);
    condRateHtml = `시간당 회복: <span style="color:#2ecc71;">+${rateH}</span>`;
  } else if (!isMgmt) {
    let selfRecoverBoost = (window.getCharMSkillEffect ? window.getCharMSkillEffect(charId, 'Self_Cond_Recover', 'ALL') : 0);
    let actualRecoverPerMin = (getMgmtARate() + selfRecoverBoost) * 0.5;
    const rateH = (actualRecoverPerMin * 60).toFixed(1);
    condRateHtml = `대기열 회복 (휴식의 50%): <span style="color:#2ecc71;">+${rateH}</span>`;
  } else if (isMgmt) {
    const pChar = PlayerData.characterStats[charId] || {};
    const starVal = pChar.star || char.Character_Star || 1;
    let tierVal = 1;
    if (char.Character_Tier === 'SR') tierVal = 2;
    if (char.Character_Tier === 'SSR') tierVal = 3;
    const totalStep = Math.min(6, tierVal + starVal);

    if (studioId === 'mgmtA') {
      const buffA = [0.20, 0.22, 0.24, 0.26, 0.28, 0.30, 0.32];
      const stepVal = buffA[totalStep];
      condRateHtml = '매니지먼트 배치는 컨디션을 소모하지 않습니다.';
      prodHtml = `
        성급 보너스 : ${starVal}단계<br>
        티어 보너스 : ${tierVal}단계<br>
        합계 적용중 : ${totalStep}단계<br>
        기본 컨디션 회복 : 분당 0.20<br>
        <span style="color:#2ecc71;">${totalStep}단계 보너스 : 분당 ${stepVal.toFixed(2)} 회복</span>
      `;
    } else {
      const buffB = [1.00, 0.95, 0.90, 0.85, 0.80, 0.75, 0.70];
      const stepVal = buffB[totalStep];
      condRateHtml = '매니지먼트 배치는 컨디션을 소모하지 않습니다.';
      prodHtml = `
        성급 보너스 : ${starVal}단계<br>
        티어 보너스 : ${tierVal}단계<br>
        합계 적용중 : ${totalStep}단계<br>
        기본 컨디션 소모 : 분당 0.50<br>
        <span style="color:#e74c3c;">${totalStep}단계 보너스 : 분당 ${stepVal.toFixed(2)} 소모</span>
      `;
    }
  }
  
  let statsHtml = '<div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px 12px; margin-top:10px; background:rgba(0,0,0,0.3); padding:8px 12px; border-radius:5px; text-align:center;">';
  
  STUDIO_TYPES.forEach(t => {
    if (t.isMgmt) return;
    const val = window.getCharMgmtStat(char.Character_ID, t.stat);
    const isCurrent = t.id === studioId && slotType === 'active';
    const color = isCurrent ? '#f1c40f' : '#ecf0f1';
    statsHtml += `<div style="color:${color}; font-weight:${isCurrent?'bold':'normal'};">${t.emoji} ${val}</div>`;
  });
  statsHtml += '</div>';

  let tierColor = '#ecf0f1';
  if (char.Character_Tier === 'SSR') tierColor = '#ff9ff3'; // 화려한 분홍색
  else if (char.Character_Tier === 'SR') tierColor = '#f1c40f'; // 노란색
  else if (char.Character_Tier === 'R') tierColor = '#87ceeb'; // 하늘색

  
  let passiveHtml = '';
  const pChar = window.PlayerData.characterStats[charId] || {};
  const starVal = pChar.star || char.Character_Star || 1;
  
  if (window.GameData.m_skill && char.Character_M_Skill) {
      const mSkill = window.GameData.m_skill.find(s => s.M_Skill_ID === char.Character_M_Skill);
      if (mSkill) {
          const sRoom = mSkill.M_Skill_Target_Room;
          let targetRoom = typeof studioId !== 'undefined' ? studioId : deptId;
          let isActive = (sRoom === 'ALL' || sRoom === targetRoom);
          let pColor = isActive ? '#3498db' : '#95a5a6';
          let pName = mSkill.M_Skill_Name || char.Character_M_Skill;
          
          if (starVal < 2) {
              passiveHtml = `<div style="margin-top: 10px; border-top: 1px dashed #7f8c8d; padding-top: 8px; opacity: 0.5; filter: grayscale(100%);">
                  <div style="font-weight: bold; color: #e74c3c;">🔒 [미해금] ${pName} (★2 해금)</div>
                  <div style="font-size: 11px; color: #95a5a6; white-space: normal; margin-top: 2px;">${mSkill.M_Skill_Desc}</div>
              </div>`;
          } else {
              passiveHtml = `<div style="margin-top: 10px; border-top: 1px dashed #7f8c8d; padding-top: 8px;">
                  <div style="font-weight: bold; color: ${pColor};">✨ [패시브] ${pName}</div>
                  <div style="font-size: 11px; color: ${pColor}; white-space: normal; margin-top: 2px;">${mSkill.M_Skill_Desc}</div>
              </div>`;
          }
      }
  }

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
    
    ${prodHtml ? `<div style="margin-bottom:8px; border-top:1px solid rgba(255,255,255,0.2); padding-top:8px;">${prodHtml}</div>` : ''}
    
    ${statsHtml}
  `;
  // --- ADD M_SKILL INFO ---
  if (GameData.m_skill && char.Character_M_Skill) {
      const mSkill = GameData.m_skill.find(s => s.M_Skill_ID === char.Character_M_Skill);
      if (mSkill) {
          const sType = mSkill.M_Skill_Effect_Type;
          const sRoom = mSkill.M_Skill_Target_Room;
          const currentRoom = arguments[1]; // studioId or deptId
          
          let isActive = false;
          // Room match check
          if (sRoom === 'ALL' || sRoom === currentRoom) {
              // Slot type check
              if (sType === 'Self_Cond_Recover') {
                  if (slotType === 'rest') isActive = true;
              } else {
                  // All other skills apply when working (active slot)
                  if (slotType === 'active') isActive = true;
              }
          }
          
          let color = isActive ? '#3498db' : '#95a5a6'; 
          let name = mSkill.M_Skill_Name || char.Character_M_Skill;
          
          ct.innerHTML += `<div style="margin-top: 8px; border-top: 1px dashed #7f8c8d; padding-top: 5px;">
              <div style="font-weight: bold; color: ${color};">✨ ${name}</div>
              <div style="font-size: 11px; color: ${color}; white-space: normal;">${mSkill.M_Skill_Desc}</div>
          </div>`;
      }
  }
        
  ct.style.display = 'block';
}

function hideCharTooltip() {
  const ct = document.getElementById('char-tooltip');
  if (ct) ct.style.display = 'none';
}


function showItemTooltip(e, itemId) {
  let ct = document.getElementById('item-tooltip');
  if (!ct) {
    ct = document.createElement('div');
    ct.id = 'item-tooltip';
    ct.style.position = 'fixed';
    ct.style.background = 'rgba(15, 20, 25, 0.95)';
    ct.style.border = '1px solid #34495e';
    ct.style.borderRadius = '8px';
    ct.style.padding = '8px 12px';
    ct.style.color = '#ecf0f1';
    ct.style.fontSize = '12px';
    ct.style.boxShadow = '0 4px 15px rgba(0,0,0,0.5)';
    ct.style.pointerEvents = 'none';
    ct.style.zIndex = '99999';
    ct.style.lineHeight = '1.4';
    ct.style.whiteSpace = 'nowrap';
    document.body.appendChild(ct);
    
    document.addEventListener('mousemove', (ev) => {
      if (ct.style.display === 'block') {
        let x = ev.clientX + 15;
        let y = ev.clientY + 15;
        if (x + ct.offsetWidth > window.innerWidth) x = ev.clientX - ct.offsetWidth - 15;
        if (y + ct.offsetHeight > window.innerHeight) y = ev.clientY - ct.offsetHeight - 15;
        ct.style.left = x + 'px';
        ct.style.top = y + 'px';
      }
    });
  }

  const itemData = Array.isArray(GameData.items) ? GameData.items.find(i => i.Item_ID === itemId) : null;
  if (!itemData) return;
  const currentAmt = PlayerData.items[itemId] || 0;

  
  let passiveHtml = '';
  const pChar = window.PlayerData.characterStats[charId] || {};
  const starVal = pChar.star || char.Character_Star || 1;
  
  if (window.GameData.m_skill && char.Character_M_Skill) {
      const mSkill = window.GameData.m_skill.find(s => s.M_Skill_ID === char.Character_M_Skill);
      if (mSkill) {
          const sRoom = mSkill.M_Skill_Target_Room;
          let targetRoom = typeof studioId !== 'undefined' ? studioId : deptId;
          let isActive = (sRoom === 'ALL' || sRoom === targetRoom);
          let pColor = isActive ? '#3498db' : '#95a5a6';
          let pName = mSkill.M_Skill_Name || char.Character_M_Skill;
          
          if (starVal < 2) {
              passiveHtml = `<div style="margin-top: 10px; border-top: 1px dashed #7f8c8d; padding-top: 8px; opacity: 0.5; filter: grayscale(100%);">
                  <div style="font-weight: bold; color: #e74c3c;">🔒 [미해금] ${pName} (★2 해금)</div>
                  <div style="font-size: 11px; color: #95a5a6; white-space: normal; margin-top: 2px;">${mSkill.M_Skill_Desc}</div>
              </div>`;
          } else {
              passiveHtml = `<div style="margin-top: 10px; border-top: 1px dashed #7f8c8d; padding-top: 8px;">
                  <div style="font-weight: bold; color: ${pColor};">✨ [패시브] ${pName}</div>
                  <div style="font-size: 11px; color: ${pColor}; white-space: normal; margin-top: 2px;">${mSkill.M_Skill_Desc}</div>
              </div>`;
          }
      }
  }

  ct.innerHTML = `
    <div style="font-weight:bold; font-size:14px; margin-bottom:5px; color:#f1c40f;">${itemData.Item_Name}</div>
    <div style="font-size:12px; color:#bdc3c7; max-width:200px; white-space:normal; margin-bottom:8px;">${itemData.Item_Desc || ''}</div>
    <div style="font-size:11px; color:#3498db;">보유량: ${currentAmt.toLocaleString()}</div>
  `;
  
  let x = e.clientX + 15;
  let y = e.clientY + 15;
  if (x + 200 > window.innerWidth) x = e.clientX - 200;
  if (y + 100 > window.innerHeight) y = e.clientY - 100;
  ct.style.left = x + 'px';
  ct.style.top = y + 'px';
  
  ct.style.display = 'block';
}

function hideItemTooltip() {
  const ct = document.getElementById('item-tooltip');
  if (ct) ct.style.display = 'none';
}
window.showItemTooltip = showItemTooltip;
window.hideItemTooltip = hideItemTooltip;

window.getMgmtARate = getMgmtARate;
window.getMgmtBRate = getMgmtBRate;


window.spawnFloatingText = function(targetId, text, type) {
    const target = document.getElementById(targetId);
    if (!target) return;
    const rect = target.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return; // not visible
    const floater = document.createElement('div');
    floater.innerText = text;
    floater.style.position = 'fixed';
    floater.style.left = (rect.left + Math.max(50, rect.width / 2)) + 'px';
    floater.style.top = (rect.top) + 'px';
    floater.style.transform = 'translate(-50%, -50%)';
    floater.style.pointerEvents = 'none';
    floater.style.fontWeight = '900';
    floater.style.fontSize = '14px';
    floater.style.zIndex = '999999';
    floater.style.whiteSpace = 'nowrap';
    floater.style.transition = 'all 1.0s ease-out';
    floater.style.opacity = '1';
    
    if (type === 'great') {
        floater.style.color = '#e67e22'; 
        floater.style.textShadow = '-1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff, 0px 2px 4px rgba(0,0,0,0.5)';
    } else {
        floater.style.color = '#3498db'; 
        floater.style.textShadow = '-1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff, 0px 2px 4px rgba(0,0,0,0.5)';
    }
    
    document.body.appendChild(floater);
    
    setTimeout(() => {
        floater.style.top = (rect.top - 30) + 'px';
        floater.style.opacity = '0';
    }, 50);
    
    setTimeout(() => {
        if (floater.parentNode) floater.parentNode.removeChild(floater);
    }, 1050);
};




function getZeroConditionRestingMembers() {
    const targets = [];
    if (PlayerData.studio) {
        for (const key in PlayerData.studio) {
            if (PlayerData.studio[key] && PlayerData.studio[key].rest) {
                PlayerData.studio[key].rest.forEach(cid => {
                    if (cid) {
                        const stats = PlayerData.characterStats[cid];
                        if (stats && stats.condition <= 0) targets.push(cid);
                    }
                });
            }
        }
    }
    if (PlayerData.office) {
        for (const key in PlayerData.office) {
            if (PlayerData.office[key] && PlayerData.office[key].rest) {
                PlayerData.office[key].rest.forEach(cid => {
                    if (cid) {
                        const stats = PlayerData.characterStats[cid];
                        if (stats && stats.condition <= 0) targets.push(cid);
                    }
                });
            }
        }
    }
    return targets;
}

window.updateSnackBasketUI = function() {
    const slots = [document.getElementById('snack-slot'), document.getElementById('snack-slot-office')];
    slots.forEach(slot => {
        if(!slot) return;
        const active = PlayerData.activeSnack;
        if(active) {
            const amt = PlayerData.items[active] || 0;
            const itemData = Array.isArray(GameData.items) ? GameData.items.find(i => i.Item_ID === active) : null;
            if(itemData) {
                slot.innerHTML = `
                    <div style="font-size: 1.5em; margin-bottom: 5px;"><img src="${itemData.Item_Icon}" style="width:30px;height:30px;border-radius:4px;"></div>
                    <div style="font-size: 0.9em; font-weight: bold; color: #bdc3c7;">보유: ${amt}개</div>
                `;
                slot.style.borderColor = '#3498db';
                return;
            }
        }
        
        // Default
        slot.innerHTML = `
            <div style="font-size: 1.5em; margin-bottom: 5px;">🍱</div>
            <div style="font-size: 0.9em; font-weight: bold; color: #bdc3c7;">간식 바구니</div>
        `;
        slot.style.borderColor = '#7f8c8d';
    });
};

window.openSnackModal = function() {
    const modal = document.getElementById('snack-modal');
    if (!modal) return;
    const list = document.getElementById('snack-list');
    list.innerHTML = '';

    const reserveInput = document.getElementById('snack-reserve-input');
    if (reserveInput) {
        reserveInput.value = (PlayerData.snackReserve !== undefined) ? PlayerData.snackReserve : 0;
        if (!reserveInput._hasChangeListener) {
            reserveInput._hasChangeListener = true;
            reserveInput.addEventListener('input', (e) => {
                let val = parseInt(e.target.value, 10);
                if (isNaN(val) || val < 0) val = 0;
                if (val > 999) val = 999;
                PlayerData.snackReserve = val;
            });
        }
    }
    
    const snacks = [
        { id: 'Item_020', name: '쿠키', heal: 10 },
        { id: 'Item_019', name: '오니기리', heal: 20 },
        { id: 'Item_018', name: '치쿠젠니', heal: 40 }
    ];
    
    snacks.forEach(s => {
        const amt = PlayerData.items[s.id] || 0;
        let itemData = Array.isArray(GameData.items) ? GameData.items.find(i => i.Item_ID === s.id) : null;
        const iconHtml = itemData && itemData.Item_Icon ? `<img src="${itemData.Item_Icon}" style="width: 40px; height: 40px; border-radius: 6px;">` : `<div style="width:40px; height:40px; background:#444; border-radius:6px; font-size:10px; display:flex; align-items:center; justify-content:center; color:#fff;">NO IMG</div>`;
        
        const isEquipped = PlayerData.activeSnack === s.id;
        
        const row = document.createElement('div');
        row.style = `display: flex; align-items: center; justify-content: space-between; background: ${isEquipped ? '#2980b9' : '#2c3e50'}; padding: 10px 15px; border-radius: 8px; margin-bottom: 5px; border: 1px solid ${isEquipped ? '#3498db' : '#34495e'};`;
        row.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px; text-align: left;">
                ${iconHtml}
                <div>
                    <div style="font-weight: bold; font-size: 1.1em; color: #ecf0f1;">${s.name} <span style="font-size: 0.8em; color: #f39c12; margin-left: 5px;">보유: ${amt}개</span></div>
                    <div style="font-size: 0.85em; color: #2ecc71; margin-top: 2px;">컨디션을 즉시 ${s.heal} 회복합니다.</div>
                </div>
            </div>
            <div style="display: flex; gap: 8px;">
                <span style="font-size: 0.9em; font-weight: bold; color: ${isEquipped ? '#f1c40f' : '#7f8c8d'};">${isEquipped ? '✔️ 장착 중' : '클릭하여 장착'}</span>
            </div>
        `;
        
        row.style.cursor = 'pointer';
        row.onclick = () => {
            if(isEquipped) {
                PlayerData.activeSnack = null;
            } else {
                PlayerData.activeSnack = s.id;
            }
            if(window.updateSnackBasketUI) window.updateSnackBasketUI();
            if(window.openSnackModal) window.openSnackModal(); // refresh
        };
        list.appendChild(row);
    });
    
    modal.classList.add('show');
};

// Also inject into regular update flow if needed
const originalRenderStudioUI = window.renderStudioUI;
window.renderStudioUI = function() {
    if(originalRenderStudioUI) originalRenderStudioUI();
    if(window.updateSnackBasketUI) window.updateSnackBasketUI();
};

setInterval(() => { if (window.updateSnackBasketUI && window.PlayerData) window.updateSnackBasketUI(); }, 1000);
