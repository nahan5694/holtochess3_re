import { GameData, PlayerData } from './state.js?v=004276';

// 절대 규칙 8, 9: PapaParse 파싱 및 어댑터 패턴 적용

// Adapter Functions: 한글 컬럼명 등을 영어 key로 매핑
export const adapters = {
  assets: (row) => ({
    Asset_ID: row['에셋ID'] || row['Asset_ID'] || row['asset_id'] || Object.values(row)[0],
    Asset_Name: row['에셋명'] || row['Asset_Name'] || Object.values(row)[1],
    Asset_Type: row['타입'] || row['Asset_Type'] || Object.values(row)[2],
    Asset_Link: row['링크'] || row['Asset_Link'] || Object.values(row)[3]
  }),
  characters: (row) => ({
    ...row,
    Character_ID: row['캐릭터ID'] || row['Character_ID'],
    Character_Name: row['이름'] || row['Character_Name'],
    Character_SubName: row['이명'] || row['Character_SubName'],
    Character_Tier: row['등급'] || row['Character_Tier'],
    Character_Class: row['클래스'] || row['Character_Class'],
    Character_Type: row['속성'] || row['Character_Type'],
    Character_Role: row['역할군'] || row['Character_Role'],
    Character_Image_Full: row['일러스트'] || row['Character_Image_Full'],
    Character_Image_Long: row['세로일러스트'] || row['Character_Image_Long'],
    Character_Gacha_Speech: row['가챠대사'] || row['Character_Gacha_Speech']
  }),
  items: (row) => ({
    Item_ID: row['아이템ID'] || row['Item_ID'],
    Item_Name: row['이름'] || row['Item_Name'],
    Item_Type: row['타입'] || row['Item_Type'],
    Item_Sub_Type: row['서브타입'] || row['Item_Sub_Type'],
    Item_Rarity: Number(row['희귀도'] || row['Item_Rarity']) || 1,
    Item_Icon: row['아이콘'] || row['Item_Icon'],
    Item_Desc: row['설명'] || row['Item_Desc'],
    Item_Get_1: row['획득처1'] || row['Item_Get_1'],
    Item_Get_2: row['획득처2'] || row['Item_Get_2'],
    Item_Get_3: row['획득처3'] || row['Item_Get_3'],
    Pro_Req: Number(row['Pro_Req']) || 100,
    Item_Crush: Number(row['Item_Crush']) || 1
  }),
  link: (row) => ({
    Node_ID: row['노드ID'] || row['Node_ID'],
    Board_Attr: row['속성'] || row['Board_Attr'],
    Node_Name: row['노드명'] || row['Node_Name'],
    Node_Type: row['타입'] || row['Node_Type'],
    UI_Pos_X: row['X좌표'] || row['UI_Pos_X'],
    UI_Pos_Y: row['Y좌표'] || row['UI_Pos_Y'],
    Req_Node_1: row['선행1'] || row['Req_Node_1'],
    Req_Node_2: row['선행2'] || row['Req_Node_2'],
    Link_Param_1: row['스탯1'] || row['Link_Param_1'],
    Link_Param_2: row['수치1'] || row['Link_Param_2'],
    Link_Effect_Type: row['효과타입'] || row['Link_Effect_Type'],
    Cost_Credit: row['비용_크레딧'] || row['Cost_Credit'],
    Cost_Item_ID: row['비용_아이템'] || row['Cost_Item_ID'],
    Cost_Item_Qty: row['비용_아이템수량'] || row['Cost_Item_Qty'],
    Target_Type: row['적용대상'] || row['Target_Type']
  }),
  bloom: (row) => ({
    Role: row['역할군'] || row['Role'],
    Level: Number(row['단계'] || row['Level']),
    Type: row['효과타입'] || row['Type'],
    Value: Number(row['효과수치'] || row['Value']),
    Desc: row['설명'] || row['Desc']
  }),
  coreOptions: (row) => ({
    Core_E_ID: row['Core_E_ID'],
    Core_E_Tier: Number(row['Core_E_Tier']),
    Core_E_Name: row['Core_E_Name'],
    Core_E_Desc: row['Core_E_Desc'],
    Core_E_Min: Number(row['Core_E_Min']),
    Core_E_Max: Number(row['Core_E_Max']),
    Core_E_Element: (row['Core_E_Element'] || '공용').trim(),
    Core_E_Icon: row['Core_E_Icon'] || '▪'
  }),
  tag: (row) => row,
  kizuna: (row) => row,
  skills: (row) => {
    const hasAct1 = row.Act1_Type !== undefined;
    const cleanKw = (raw) => String(raw || '').replace(/^[tsaeTSAE]_/, '').trim();

    const act1 = hasAct1 ? {
      type: row.Act1_Type || 'NONE',
      target: row.Act1_Target || row.Skill_Target || '적',
      method: row.Act1_Target_Method || row.Skill_Target_Method || '어그로',
      range: row.Act1_Range || row.Skill_Target_Range || 'SINGLE',
      count: Number(row.Act1_Target_Count) || 1,
      calc: row.Act1_Calc_Base || row.Skill_Calc_Base || '공격력',
      multiplier: Number(row.Act1_Multiplier !== undefined ? row.Act1_Multiplier : row.Skill_Multiplier) || 0,
      breakDmg: Number(row.Act1_Break !== undefined ? row.Act1_Break : row.Skill_Break) || 0,
      key1Id: cleanKw(row.Act1_Key_1_ID),
      key1Val1: Number(row.Act1_Key_1_Val1) || 0,
      key1Val2: Number(row.Act1_Key_1_Val2) || 0,
      key2Id: cleanKw(row.Act1_Key_2_ID),
      key2Val1: Number(row.Act1_Key_2_Val1) || 0,
      key2Val2: Number(row.Act1_Key_2_Val2) || 0
    } : null;

    if (act1 && (act1.type === 'NONE' || act1.type === '')) {
      const desc = String(row.Skill_Desc || '');
      if (desc.includes('물리 피해') || desc.includes('물리피해')) {
        act1.type = 'DAMAGE_PHYS';
        act1.calc = '공격력';
        act1.target = act1.target || '적';
        const multMatch = desc.match(/(\d+)%/);
        if (multMatch && (!act1.multiplier || act1.multiplier === 0)) {
          act1.multiplier = Number(multMatch[1]);
        }
      } else if (desc.includes('마법 피해') || desc.includes('마법피해')) {
        act1.type = 'DAMAGE_MAGIC';
        act1.calc = '아이돌력';
        act1.target = act1.target || '적';
        const multMatch = desc.match(/(\d+)%/);
        if (multMatch && (!act1.multiplier || act1.multiplier === 0)) {
          act1.multiplier = Number(multMatch[1]);
        }
      }
    }

    const act2 = (hasAct1 && row.Act2_Type && row.Act2_Type !== 'NONE') ? {
      type: row.Act2_Type,
      target: row.Act2_Target || '자신',
      method: row.Act2_Target_Method || '자동',
      range: row.Act2_Range || 'SINGLE',
      count: Number(row.Act2_Target_Count) || 1,
      calc: row.Act2_Calc_Base || '아이돌력',
      multiplier: Number(row.Act2_Multiplier) || 0,
      breakDmg: Number(row.Act2_Break) || 0,
      key1Id: cleanKw(row.Act2_Key_1_ID),
      key1Val1: Number(row.Act2_Key_1_Val1) || 0,
      key1Val2: Number(row.Act2_Key_1_Val2) || 0,
      key2Id: cleanKw(row.Act2_Key_2_ID),
      key2Val1: Number(row.Act2_Key_2_Val1) || 0,
      key2Val2: Number(row.Act2_Key_2_Val2) || 0
    } : null;

    const cond = (hasAct1 && row.Cond_Trigger && row.Cond_Trigger !== 'NONE') ? {
      trigger: row.Cond_Trigger,
      paramKw: cleanKw(row.Cond_Param_Keyword),
      paramVal: row.Cond_Param_Value,
      effectType: row.Cond_Effect_Type,
      effectTarget: row.Cond_Effect_Target,
      effectVal1: cleanKw(row.Cond_Effect_Val1),
      effectVal2: row.Cond_Effect_Val2
    } : null;

    return {
      ...row,
      Skill_Target: row.Act1_Target || row.Skill_Target || '적',
      Skill_Target_Range: row.Act1_Range || row.Skill_Target_Range || 'SINGLE',
      act1,
      act2,
      cond,
      hasMultiAction: Boolean(act1)
    };
  },
  keyword: (row) => ({
    ...row,
    triggerEvent: row.Keyword_Trigger_Event || 'NONE',
    triggerTarget: row.Keyword_Trigger_Target || 'SELF',
    triggerAction: row.Keyword_Trigger_Action || 'NONE',
    triggerVal1: row.Keyword_Trigger_Val1 || '',
    triggerVal2: row.Keyword_Trigger_Val2 || ''
  }),
  p_skill: (row) => row
};

async function fetchAndParseCSV(url, retries = 2) {
  return new Promise((resolve, reject) => {
    Papa.parse(url, {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        if (results.data && results.data.length > 0) {
            const firstKey = Object.keys(results.data[0])[0];
            if (firstKey && firstKey.toLowerCase().includes('doctype html')) {
                if (retries > 0) {
                    console.warn("Rate limit hit, retrying...", url);
                    await new Promise(r => setTimeout(r, 1000));
                    try {
                        const retryData = await fetchAndParseCSV(url, retries - 1);
                        return resolve(retryData);
                    } catch (e) {
                        return reject(e);
                    }
                } else {
                    console.error("Rate limit failed permanently", url);
                    return resolve([]);
                }
            }
        }
        resolve(results.data);
      },
      error: (error) => {
         console.error("PapaParse error for URL:", url, error);
         reject(error);
      }
    });
  });
}

export async function initGameData(setStatusText) {
  try {
    if (setStatusText) setStatusText("마스터 인덱스 연결 중...");
    
    // 절대 규칙 8: 마스터 인덱스 시트 주소
    const masterIndexUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRwGErk_ie6PCyywOjQOFNI0uhjPM9IpwIiOxcuXte54cPYA78Q6H3Zmm4nB3apbXPnOq2YkFtT4Dj0/pub?gid=1658227543&single=true&output=csv";
    const masterData = await fetchAndParseCSV(masterIndexUrl);
    
    const pipelines = [];
    masterData.forEach(row => {
      const keys = Object.keys(row);
      const keyCol = keys.find(k => k.includes('Key')) || keys[0];
      const urlCol = keys.find(k => k.includes('URL')) || keys[1];
      const rawKey = row[keyCol] ? String(row[keyCol]).trim() : "";
      const url = row[urlCol] ? String(row[urlCol]).trim() : "";
      if (rawKey && url) {
        let dk = rawKey.toLowerCase();
        if (dk.includes('item')) dk = 'items';
        else if (dk.includes('character')) dk = 'characters';
        else if (dk.includes('song')) dk = 'songs';
        else if (dk.includes('core')) dk = 'coreOptions';
        else if (dk.includes('level')) dk = 'levels';
        else if (dk.includes('shop')) dk = 'shop';
        else if (dk.includes('issue')) dk = 'issue';
        pipelines.push({ dataKey: dk, label: rawKey, url: url });
      }
    });

    for (const config of pipelines) {
      if (!config.url || !config.dataKey) continue;
      if (setStatusText) setStatusText(`데이터라인 연결 중... [${config.label}]`);
      
      const rawData = await fetchAndParseCSV(config.url);
      await new Promise(r => setTimeout(r, 300)); // Prevent Google Sheets rate limiting
      
      // 어댑터 패턴 적용
      if (config.dataKey === 'bloom') {
        const parsedBloom = [];
        const roleRow = rawData.find(r => r['(Key)'] === 'Bloom' || Object.values(r).includes('근거리 딜러'));
        if (roleRow) {
          const keys = Object.keys(roleRow).filter(k => k !== '(Key)' && roleRow[k]);
          
          for (let level = 1; level <= 5; level++) {
            const descRow = rawData.find(r => r['(Key)'] === `Bloom_Desc_${level}`);
            const statRow = rawData.find(r => r['(Key)'] === `Bloom_Stat_${level}`);
            const valRow = rawData.find(r => r['(Key)'] === `Bloom_Val_${level}`);
            
            if (descRow && statRow && valRow) {
              keys.forEach(k => {
                if (roleRow[k]) {
                  parsedBloom.push({
                    Role: roleRow[k],
                    Level: level,
                    Type: statRow[k],
                    Value: Number(valRow[k]) || 0,
                    Desc: descRow[k]
                  });
                }
              });
            }
          }
        }
        GameData.bloom = parsedBloom;
      } else {
        const adapter = adapters[config.dataKey];
        if (adapter) {
          GameData[config.dataKey] = rawData.map(adapter);
          
          if (config.dataKey === 'characters') {
              GameData.characters = GameData.characters.filter(c => c.Character_ID && c.Character_ID !== '캐릭터ID' && c.Character_ID !== '(Key)');
          } else if (config.dataKey === 'skills') {
              GameData.skills = GameData.skills.filter(s => s.Skill_ID && s.Skill_ID !== '스킬ID' && s.Skill_ID !== '(Key)' && s.Skill_ID !== 'Skill_ID');
          } else if (config.dataKey === 'keyword') {
              GameData.keyword = GameData.keyword.filter(k => k.Keyword_ID && k.Keyword_ID !== '키워드ID' && k.Keyword_ID !== '(Key)' && k.Keyword_ID !== 'Keyword_ID');
              const danceKw = GameData.keyword.find(k => k.Keyword_ID === 'Key_032' || k.Keyword_Name === '댄싱');
              if (danceKw && danceKw.Keyword_Desc && !danceKw.Keyword_Desc.includes('회피 발동')) {
                danceKw.Keyword_Desc += '. 회피 발동 시 지속 턴 1 감소.';
              }
          } else if (config.dataKey === 'p_skill') {
              GameData.p_skill = GameData.p_skill.filter(p => p.P_Skill_ID && p.P_Skill_ID !== '패시브ID' && p.P_Skill_ID !== '(Key)' && p.P_Skill_ID !== 'P_Skill_ID');
          } else if (config.dataKey === 'coreOptions') {
              GameData.coreOptions = GameData.coreOptions.filter(c => c.Core_E_ID && c.Core_E_ID !== '코어효과 아이디');
          } else if (config.dataKey === 'tag') {
              GameData.tag = GameData.tag.filter(t => t.Tag_ID && t.Tag_ID !== '아이디');
          } else if (config.dataKey === 'kizuna') {
              GameData.kizuna = GameData.kizuna.filter(k => k.Kizuna_ID && k.Kizuna_ID !== '키즈나 아이디');
          }
        } else {
          GameData[config.dataKey] = rawData;
        }
      }
    }

    console.log("초기화 완료된 게임 데이터:", GameData);
    window.GameData = GameData;
    return true;
  } catch (error) {
    console.error("데이터 초기화 중 오류 발생:", error);
    return false;
  }
}
