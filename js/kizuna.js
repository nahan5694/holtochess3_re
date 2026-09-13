import { GameData, PlayerData } from './state.js?v=004276';

let activeTab = 'list';

export function getOwnedCharacters() {
  return PlayerData.characters || [];
}

export function getCharacterData(id) {
  return GameData.characters.find(c => c.Character_ID === id);
}

export function getOwnedCharactersByRarity() {
  const owned = getOwnedCharacters();
  const result = [];
  for (let id of owned) {
    const data = getCharacterData(id);
    if(data) result.push(data);
  }
  return result;
}

export function calculateKizunaProgress() {
  const counts = {};
  if(!GameData.tag) return counts;
  
  GameData.tag.forEach(t => {
    counts[t.Tag_Name] = { R: 0, SR: 0, SSR: 0, total: 0, tagData: t };
  });

  const owned = getOwnedCharactersByRarity();
  for (let c of owned) {
    const subTags = (c.Character_SubTag || "").split('/').map(s => s.trim()).filter(s => s);
    const mainTag = (c.Character_MainTag || "").trim();
    const allTags = new Set([...subTags, mainTag]);
    
    for (let t of allTags) {
      if (counts[t]) {
        if (c.Character_Tier === 'R') counts[t].R++;
        else if (c.Character_Tier === 'SR') counts[t].SR++;
        else if (c.Character_Tier === 'SSR') counts[t].SSR++;
        counts[t].total++;
      }
    }
  }
  return counts;
}

export function calculateKizunaPoints(counts) {
  let totalPoints = 0;
  const tagPoints = {};
  
  for (const [tagName, data] of Object.entries(counts)) {
    let pts = 0;
    const t = data.tagData;
    
    pts += data.R * (Number(t.Tag_R_Score) || 0);
    pts += data.SR * (Number(t.Tag_SR_Score) || 0);
    pts += data.SSR * (Number(t.Tag_SSR_Score) || 0);
    
    if (t.Tag_Type === '3단계형') {
      if (data.total >= Number(t.Tag_1_Count)) pts += Number(t.Tag_First_Bonus) || 0;
      if (data.total >= Number(t.Tag_2_Count)) pts += Number(t.Tag_Second_Bonus) || 0;
      if (data.total >= Number(t.Tag_Full_Count)) pts += Number(t.Tag_Completion_Bonus) || 0;
    } else if (t.Tag_Type === '2인 완성형') {
      if (data.total >= Number(t.Tag_Full_Count)) pts += Number(t.Tag_Completion_Bonus) || 0;
    }
    
    tagPoints[tagName] = pts;
    totalPoints += pts;
  }
  
  return { totalPoints, tagPoints };
}

export function getSpentKizunaPoints() {
  let spent = 0;
  const spentByTab = { "기수 키즈나": 0, "속성 키즈나": 0, "통상 키즈나": 0 };
  
  if(!PlayerData.kizunaTree) PlayerData.kizunaTree = {};
  
  for (let [nodeId, level] of Object.entries(PlayerData.kizunaTree)) {
    const k = GameData.kizuna.find(x => x.Kizuna_ID === nodeId);
    if(k && level > 0) {
      const cost = level * (Number(k.Kizuna_Need_Point) || 0);
      spent += cost;
      spentByTab[k.Kizuna_Tab] = (spentByTab[k.Kizuna_Tab] || 0) + cost;
    }
  }
  return { spent, spentByTab };
}

export function getAvailableKizunaPoints() {
  const counts = calculateKizunaProgress();
  const { totalPoints } = calculateKizunaPoints(counts);
  const { spent } = getSpentKizunaPoints();
  return { totalPoints, spent, currentPoints: totalPoints - spent, counts };
}
window.getAvailableKizunaPoints = getAvailableKizunaPoints;

export function initKizunaSystem() {
  const tabBtns = document.querySelectorAll('.kizuna-tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeTab = btn.getAttribute('data-tab');
      renderKizunaScene();
    });
  });
  
  const resetBtn = document.getElementById('btn-kizuna-reset');
  if(resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (activeTab === 'list') return;
      const { spentByTab } = getSpentKizunaPoints();
      const spentInTab = spentByTab[activeTab] || 0;
      if(spentInTab <= 0) {
        alert('이 탭에 투자한 포인트가 없습니다.');
        return;
      }
      
      const cost = spentInTab * 100;
      const currentCredit = PlayerData.items["Item_002"] || 0;
      if (currentCredit < cost) {
        alert('크레딧이 부족합니다!');
        return;
      }
      
      if(confirm(`해당 탭의 스킬트리를 초기화하시겠습니까?\n비용: ${cost} 크레딧`)) {
        PlayerData.items["Item_002"] -= cost;
        
        const nodesToReset = GameData.kizuna.filter(k => k.Kizuna_Tab === activeTab).map(k => k.Kizuna_ID);
        nodesToReset.forEach(id => {
          if(PlayerData.kizunaTree[id]) {
            PlayerData.kizunaTree[id] = 0;
          }
        });
        
        // 트리거 세이브 (Proxy set)
        PlayerData.kizunaTree = { ...PlayerData.kizunaTree };
        renderKizunaScene();
      }
    });
  }

  window.addEventListener('stateChange:PlayerData', () => {
    const scene7 = document.getElementById('scene-7');
    if (scene7 && scene7.classList.contains('active')) {
      renderKizunaScene();
    }
  });

  // Watch for scene change directly to render when opening
  const obs = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.target.id === 'scene-7' && mutation.target.classList.contains('active')) {
        renderKizunaScene();
      }
    });
  });
  const s7 = document.getElementById('scene-7');
  if(s7) obs.observe(s7, { attributes: true, attributeFilter: ['class'] });
}

export function renderKizunaScene() {
  const { totalPoints, currentPoints, counts } = getAvailableKizunaPoints();
  const { spentByTab } = getSpentKizunaPoints();
  
  const currentEl = document.getElementById('kizuna-current-points');
  const totalEl = document.getElementById('kizuna-total-points');
  if(currentEl) currentEl.textContent = currentPoints.toFixed(1);
  if(totalEl) totalEl.textContent = totalPoints.toFixed(1);
  
  const resetBtn = document.getElementById('btn-kizuna-reset');
  const costSpan = document.getElementById('kizuna-reset-cost');
  
  const listPane = document.getElementById('kizuna-tab-list');
  const treePane = document.getElementById('kizuna-tab-tree');
  
  if (activeTab === 'list') {
    if(resetBtn) resetBtn.style.display = 'none';
    if(listPane) listPane.style.display = 'block';
    if(treePane) treePane.style.display = 'none';
    renderKizunaList(counts);
  } else {
    if(resetBtn) resetBtn.style.display = 'inline-block';
    const cost = (spentByTab[activeTab] || 0) * 100;
    if(costSpan) costSpan.textContent = `(${cost} C)`;
    if(listPane) listPane.style.display = 'none';
    if(treePane) treePane.style.display = 'block';
    renderKizunaTree(activeTab);
  }
}

function renderKizunaList(counts) {
  const wrapper = document.getElementById('kizuna-list-wrapper');
  if(!wrapper) return;
  wrapper.innerHTML = '';
  
  const { tagPoints } = calculateKizunaPoints(counts);
  
  const groups = {
    '3단계형': [],
    '2인 완성형': [] // Note: might be '2인완성형' or '2인 완성형' in data. Usually '2인 완성형' based on previous code.
  };
  
  Object.values(counts).forEach(data => {
    let type = data.tagData.Tag_Type;
    if (type && type.replace(/\s+/g, '') === '2인완성형') type = '2인 완성형';
    else if (type && type.replace(/\s+/g, '') === '3단계형') type = '3단계형';
    if(groups[type]) groups[type].push(data);
  });
  
  const createTagCard = (data) => {
    const t = data.tagData;
    const pts = tagPoints[t.Tag_Name] || 0;
    
    const card = document.createElement('div');
    card.className = 'kizuna-tag-card';
    
    const header = document.createElement('div');
    header.className = 'kizuna-tag-header';
    header.innerHTML = `
      <div class="kizuna-tag-title">${t.Tag_Name}</div>
      <div class="kizuna-tag-points">+${pts.toFixed(1)} pt</div>
    `;
    
    const maxCap = Number(t.Tag_Cap) || 2;
    
    const drawGauge = (label, count, rarityClass) => {
        let gaugeHtml = `<div class="kizuna-gauge-row"><span class="kizuna-gauge-label ${rarityClass}">${label}</span><div class="kizuna-gauge-track">`;
        
        let st1, st2, st3;
        if (t.Tag_Type.includes('3단계')) {
            st1 = Math.ceil(maxCap / 3);
            st2 = Math.ceil(maxCap * 2 / 3);
            st3 = maxCap;
        } else {
            st1 = Math.ceil(maxCap / 2);
            st2 = maxCap;
            st3 = maxCap;
        }

        let filledSlotClass = 'filled';
        if (count > 0) {
            if (t.Tag_Type.includes('3단계')) {
                if (count >= st3) filledSlotClass = 'filled-stage3';
                else if (count >= st2) filledSlotClass = 'filled-stage2';
                else filledSlotClass = 'filled-stage1';
            } else {
                if (count >= st2) filledSlotClass = 'filled-stage2';
                else filledSlotClass = 'filled-stage1';
            }
        }

        for(let i = 0; i < maxCap; i++) {
            const isFilled = i < count;
            const req = i + 1;
            
            let slotClass = '';
            
            if (isFilled) {
                slotClass = filledSlotClass;
            } else {
                if (t.Tag_Type.includes('3단계')) {
                    if (req <= st1) slotClass = 'empty-stage1-3step';
                    else if (req <= st2) slotClass = 'empty-stage2-3step';
                    else slotClass = 'empty-stage3-3step';
                } else {
                    if (req <= st1) slotClass = 'empty-stage1-2step';
                    else slotClass = 'empty-stage2-2step';
                }
            }
            
            gaugeHtml += `<div class="kizuna-gauge-slot ${slotClass}"></div>`;
        }
        
        let countColor = '#555';
        if (count >= maxCap) countColor = '#0984e3';
        else if (count === 0) countColor = '#e74c3c';
        
        gaugeHtml += `</div><span class="kizuna-gauge-count" style="color: ${countColor};">${count} / ${maxCap}</span></div>`;
        return gaugeHtml;
    };
    
    const gauges = document.createElement('div');
    gauges.className = 'kizuna-gauges';
    gauges.innerHTML = `
      ${drawGauge('R', data.R, 'rarity-r')}
      ${drawGauge('SR', data.SR, 'rarity-sr')}
      ${drawGauge('SSR', data.SSR, 'rarity-ssr')}
    `;
    
    card.appendChild(header);
    card.appendChild(gauges);
    return card;
  };
  
  const appendSection = (title, items) => {
    if(items.length === 0) return;
    
    const sectionHeader = document.createElement('div');
    sectionHeader.className = 'kizuna-section-header';
    sectionHeader.innerHTML = `<h3>${title}</h3><div class="kizuna-divider"></div>`;
    wrapper.appendChild(sectionHeader);
    
    items.forEach(data => {
      wrapper.appendChild(createTagCard(data));
    });
  };
  
  appendSection('3단계형', groups['3단계형']);
  appendSection('2인 완성형', groups['2인 완성형']);
}

function renderKizunaTree(tabName) {
  const wrapper = document.getElementById('kizuna-tree-wrapper');
  if(!wrapper) return;
  wrapper.innerHTML = '';
  
  if(!GameData.kizuna) return;
  const nodes = GameData.kizuna.filter(k => k.Kizuna_Tab === tabName);
  
  nodes.forEach(node => {
    const level = PlayerData.kizunaTree[node.Kizuna_ID] || 0;
    const max = Number(node.Kizuna_Max) || 1;
    const cost = Number(node.Kizuna_Need_Point) || 0;
    
    let isUnlocked = true;
    if (node.Kizuna_Parent && node.Kizuna_Parent !== 'none') {
        const pLevel = PlayerData.kizunaTree[node.Kizuna_Parent] || 0;
        if (pLevel < 1) isUnlocked = false; // 1개만 찍어도 다음 단계 개방
    }
    
    let bannerColor = '#e9ecef';
    let bannerTextColor = '#333';
    if (level > 0) {
        if (max === 1) {
            bannerColor = '#48dbfb';
            bannerTextColor = '#fff';
        } else {
            if (level === 1) { bannerColor = '#f1c40f'; bannerTextColor = '#fff'; }
            else if (level === 2) { bannerColor = '#ff9ff3'; bannerTextColor = '#fff'; }
            else if (level >= 3) { bannerColor = '#48dbfb'; bannerTextColor = '#fff'; }
        }
    }
    if (!isUnlocked) {
        bannerColor = '#f8f9fa';
        bannerTextColor = '#6c757d';
    }

      let statText = '';
      if (node.Kizuna_Stat_1 && node.Kizuna_Value_1) {
          statText += `${node.Kizuna_Stat_1} +${node.Kizuna_Value_1}`;
      }
      if (node.Kizuna_Stat_2 && node.Kizuna_Value_2) {
          if (statText) statText += ', ';
          statText += `${node.Kizuna_Stat_2} +${node.Kizuna_Value_2}`;
      }
      let targetText = (node.Kizuna_Target || '').trim();
      if (!targetText || targetText === '전체' || targetText.toLowerCase() === 'all') {
          targetText = '모든 홀로멤';
      }
      statText = `<span style="color:#e17055;">[${targetText}]</span>&nbsp;&nbsp;` + statText;
      if (!statText) statText = '스탯 정보 없음';

      const nodeEl = document.createElement('div');
      nodeEl.className = 'kizuna-node' + (isUnlocked ? '' : ' locked');
      nodeEl.innerHTML = `
        <div style="background: ${bannerColor}; color: ${bannerTextColor}; padding: 6px 10px; border-radius: 6px 6px 0 0; margin: -15px -15px 10px -15px; text-align: center;">
          <div class="kizuna-node-name" style="color: inherit; margin: 0;">${node.Kizuna_Name}</div>
        </div>
        <div style="padding: 0 5px;">
          <div class="kizuna-node-level">${level} / ${max}</div>
          <div class="kizuna-node-stats-placeholder" style="color: #4a69bd; font-weight: bold;">${statText}</div>
          <div class="kizuna-node-cost">비용: ${cost}pt</div>
        </div>
      `;
    
    if(isUnlocked) {
      nodeEl.addEventListener('click', () => {
        if (level >= max) {
          alert('이미 마스터한 키즈나입니다.');
          return;
        }
        const { currentPoints } = getAvailableKizunaPoints();
        if (currentPoints < cost) {
          alert('키즈나 포인트가 부족합니다.');
          return;
        }
        
        PlayerData.kizunaTree = { ...PlayerData.kizunaTree, [node.Kizuna_ID]: level + 1 };
        // UI is re-rendered by stateChange:PlayerData
      });
    }
    
    wrapper.appendChild(nodeEl);
  });
}
