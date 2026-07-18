export type ArchetypeId =
  | "futurist"
  | "rebel"
  | "observer"
  | "humanitarian"
  | "inventor"
  | "wanderer"
  | "visionary"
  | "hacker";

export type NpcData = {
  id: ArchetypeId;
  title: string;
  english: string;
  model: string;
  region: string;
  position: [number, number, number];
  facing: number;
  color: string;
  accent: string;
  quote: string;
  keywords: string[];
  core: string;
  strength: string;
  shadow: string;
  relation: string;
  fragment: string;
};

export type HumanId =
  | "canal-guard"
  | "solar-seller"
  | "bubble-commuter"
  | "archive-courier"
  | "dome-neighbor"
  | "cow-bureaucrat";

export type HumanData = {
  id: HumanId;
  title: string;
  english: string;
  model: string;
  position: [number, number, number];
  facing: number;
  accent: string;
  role: string;
  legend: string;
  rumor: string;
  detail: string;
};

export type AquariusObjectKind = "artifact" | "creature";

export type AquariusObjectId =
  | "reverse-clock"
  | "contrarian-vending"
  | "crowd-antenna"
  | "unwritten-chair"
  | "habitat-dome"
  | "oxygen-tree"
  | "hydroponic-kitchen"
  | "memory-market"
  | "monorail-station"
  | "flying-cow"
  | "signal-jellyfish"
  | "quantum-deer"
  | "bubble-dog"
  | "solar-sheep"
  | "paper-ray";

export type AquariusObjectData = {
  id: AquariusObjectId;
  kind: AquariusObjectKind;
  title: string;
  english: string;
  position: [number, number, number];
  accent: string;
  prompt: string;
  response: string;
  trait: string;
  collisionRadius: number;
};

export type PlayerAvatarId =
  | "neutral-human"
  | "blocky-boy"
  | "blocky-girl"
  | "aqua-alien"
  | "helmet-alien"
  | "raptor";

export type PlayerAvatarData = {
  id: PlayerAvatarId;
  title: string;
  description: string;
  model: string;
  scale: number;
  neutralSkin?: boolean;
};

export const WORLD_CONFIG = {
  moveSpeed: 4.35,
  runSpeed: 7.25,
  acceleration: 10,
  damping: 8.5,
  jumpPower: 6.2,
  gravity: 16,
  worldRadius: 62,
  interactDistance: 3.4,
  revealDistance: 10.5,
  cameraMin: 2.8,
  cameraMax: 22,
  modelScale: 0.78,
  playerScale: 0.0034,
};

export const CHARACTER_ASSETS = [
  "/assets/cube-world/characters/Character_Male_1.gltf",
  "/assets/cube-world/characters/Character_Female_1.gltf",
  "/assets/cube-world/characters/Character_Male_2.gltf",
  "/assets/cube-world/characters/Character_Female_2.gltf",
];

export const PLAYER_MODEL = "/assets/player/player-neutral.fbx";

export const PLAYER_AVATARS: PlayerAvatarData[] = [
  {
    id: "neutral-human",
    title: "中性旅人",
    description: "低多邊形人體風格",
    model: "/assets/player/player-neutral.fbx",
    scale: 0.0034,
    neutralSkin: true,
  },
  {
    id: "blocky-boy",
    title: "方塊男孩",
    description: "Cube World 角色",
    model: "/assets/cube-world/characters/Character_Male_1.gltf",
    scale: 0.82,
  },
  {
    id: "blocky-girl",
    title: "方塊女孩",
    description: "Cube World 角色",
    model: "/assets/cube-world/characters/Character_Female_1.gltf",
    scale: 0.82,
  },
  {
    id: "aqua-alien",
    title: "水瓶外星人",
    description: "會跑跳的外星居民",
    model: "/assets/animated/aliens/alien.fbx",
    scale: 0.0049,
  },
  {
    id: "helmet-alien",
    title: "頭盔外星人",
    description: "宇宙探險風格",
    model: "/assets/animated/aliens/alien-helmet.fbx",
    scale: 0.0046,
  },
  {
    id: "raptor",
    title: "迅猛龍",
    description: "恐龍玩家角色",
    model: "/assets/animated/dinosaurs/velociraptor.fbx",
    scale: 0.0015,
  },
];

export const HUMANS: HumanData[] = [
  {
    id: "canal-guard",
    title: "水道守夜人",
    english: "CANAL GUARD",
    model: "/assets/cube-world/characters/Character_Male_2.gltf",
    position: [1.9, 0, 12.8],
    facing: -2.25,
    accent: "#7dd3fc",
    role: "人類居民",
    legend:
      "我聽過一個城市傳說：夜裡有一群奇怪的人類沿著發光水道倒著走，說這樣比較容易撞見明天。",
    rumor:
      "他們每走到橋下就交換影子，還會向路燈報告自己今天沒有變正常。",
    detail:
      "如果你看見地上有反方向的濕腳印，別擦掉。那是他們留給迷路外星人的地圖。",
  },
  {
    id: "solar-seller",
    title: "太陽能小販",
    english: "SOLAR SELLER",
    model: "/assets/cube-world/characters/Character_Female_1.gltf",
    position: [-13.2, 0, -9.2],
    facing: 1.05,
    accent: "#f6d365",
    role: "人類居民",
    legend:
      "太陽能田旁有一群很怪的人類，白天替每片面板取名字，晚上問它們今天吸收了幾個願望。",
    rumor:
      "有人說他們把早餐夾在面板背面曬，結果吐司開始預測天氣。",
    detail:
      "他們最怕陰天，因為陰天時所有面板都會一起沉默，像整座城市在裝睡。",
  },
  {
    id: "bubble-commuter",
    title: "泡泡通勤者",
    english: "BUBBLE COMMUTER",
    model: "/assets/cube-world/characters/Character_Male_1.gltf",
    position: [2.8, 0, 1.4],
    facing: 0.52,
    accent: "#c4b5fd",
    role: "人類居民",
    legend:
      "中央站有一群奇怪的人類從不搭車，他們只站在泡泡裡等交通工具自己產生意義。",
    rumor:
      "他們說每個泡泡都是一個臨時宇宙，遲到只是宇宙膨脹速度太慢。",
    detail:
      "如果泡泡突然貼到你耳邊，它不是要嚇你，是想確認你的目的地有沒有詩意。",
  },
  {
    id: "archive-courier",
    title: "記憶快遞員",
    english: "ARCHIVE COURIER",
    model: "/assets/cube-world/characters/Character_Female_2.gltf",
    position: [11.8, 0, -8.5],
    facing: -0.82,
    accent: "#fb7185",
    role: "人類居民",
    legend:
      "記憶市集裡有一群奇怪的人類專門寄送還沒發生的回憶，收件人通常要三年後才想起來簽收。",
    rumor:
      "他們會把空信封貼在額頭上跑步，說這樣可以讓想法先抵達。",
    detail:
      "我送過一封信，裡面只有一句話：『你現在懷疑的那件事，其實會變成門。』",
  },
  {
    id: "dome-neighbor",
    title: "穹頂鄰居",
    english: "DOME NEIGHBOR",
    model: "/assets/cube-world/characters/Character_Female_1.gltf",
    position: [13.6, 0, 7.8],
    facing: -2.65,
    accent: "#5eead4",
    role: "人類居民",
    legend:
      "共生穹頂裡有一群奇怪的人類每天搬家到隔壁房間，聲稱自由就是不讓家具太了解自己。",
    rumor:
      "他們的門牌每天早上重新抽籤，有一次連飛天牛都抽到地下室。",
    detail:
      "但是他們很善良。誰迷路，他們就把整棟房子旋轉到你面前，假裝這才是原本的路。",
  },
  {
    id: "cow-bureaucrat",
    title: "飛牛稽核員",
    english: "AEROCOW CLERK",
    model: "/assets/cube-world/characters/Character_Male_2.gltf",
    position: [4.8, 0, 15.7],
    facing: -2.9,
    accent: "#e0f2fe",
    role: "人類居民",
    legend:
      "牧場那邊有一群奇怪的人類，遇見會飛的牛時第一句話不是驚呼，而是問牠有沒有飛行收據。",
    rumor:
      "他們相信所有荒謬都要蓋章，否則城市會分不清奇蹟和違規停車。",
    detail:
      "上週有頭牛拒絕填表，只打了個反重力嗝，整個辦公室就浮起來十五分鐘。",
  },
];

export const AQUARIUS_OBJECTS: AquariusObjectData[] = [
  {
    id: "reverse-clock",
    kind: "artifact",
    title: "逆轉水鐘",
    english: "REVERSE CLOCK",
    position: [2.6, 0, -2.8],
    accent: "#7dd3fc",
    prompt: "時間正在倒著滴水",
    response: "你摸到水面時，剛剛那個念頭先回到了五秒前。這個裝置提醒水瓶座：未來感有時不是往前衝，而是回去改寫起點。",
    trait: "不照時間順序思考",
    collisionRadius: 0.95,
  },
  {
    id: "contrarian-vending",
    kind: "artifact",
    title: "反答案販賣機",
    english: "CONTRARIAN VENDING",
    position: [-11.4, 0, 10.2],
    accent: "#f6b04d",
    prompt: "按鈕上寫著：不要按",
    response: "機器吐出一張紙條：『如果大家都同意，先懷疑一下。』它專門販售不合群的答案，但偶爾也會掉出真正有用的捷徑。",
    trait: "越被禁止越想測試",
    collisionRadius: 1.15,
  },
  {
    id: "crowd-antenna",
    kind: "artifact",
    title: "群體腦波天線",
    english: "COMMONS ANTENNA",
    position: [15.4, 0, 8.7],
    accent: "#5eead4",
    prompt: "天線正在收集眾人的怪想法",
    response: "你聽見很多聲音同時說：『世界可以再公平一點，也可以再怪一點。』它把個人的異想天開翻譯成集體行動。",
    trait: "一邊疏離人群，一邊想改善人類",
    collisionRadius: 1,
  },
  {
    id: "unwritten-chair",
    kind: "artifact",
    title: "不坐的椅子",
    english: "UNWRITTEN CHAIR",
    position: [-12.1, 0, 9.7],
    accent: "#fb7185",
    prompt: "這張椅子拒絕被定義成椅子",
    response: "你靠近時，它把自己折成一座小舞台。水瓶座很常這樣：不是反對椅子，而是反對『只能被當成椅子』。",
    trait: "拒絕固定用途",
    collisionRadius: 0.9,
  },
  {
    id: "habitat-dome",
    kind: "artifact",
    title: "共生居住穹頂",
    english: "COMMONS HABITAT",
    position: [17.4, 0, 7.2],
    accent: "#74f0d4",
    prompt: "穹頂正在調整適合人類與外星人的氣壓",
    response: "透明穹頂裡有睡眠艙、共享廚房和一面會改變意見的牆。這裡不是住宅區，而是一個練習共存的實驗室。",
    trait: "自由不是獨居，而是重新設計共住規則",
    collisionRadius: 1.55,
  },
  {
    id: "oxygen-tree",
    kind: "artifact",
    title: "氧氣樹",
    english: "OXYGEN TREE",
    position: [17.2, 0, 11.5],
    accent: "#5eead4",
    prompt: "樹冠正在把星塵轉成可呼吸的空氣",
    response: "氧氣樹的葉片像天線一樣微微旋轉。它證明這顆星球不是只為觀賞而存在，而是真的能讓奇怪的人活下去。",
    trait: "把科技做成生態，把生態做成公共設施",
    collisionRadius: 1.05,
  },
  {
    id: "hydroponic-kitchen",
    kind: "artifact",
    title: "水耕星球食堂",
    english: "HYDROPONIC KITCHEN",
    position: [10.4, 0, 11.1],
    accent: "#f6d365",
    prompt: "食堂正在烹調明天才發明的食物",
    response: "這裡的蔬菜漂浮在水管裡，調味料由 AI 和夢境共同決定。水瓶座外星人把吃飯也當成社會設計。",
    trait: "連日常生活都要先做一次原型",
    collisionRadius: 1.25,
  },
  {
    id: "memory-market",
    kind: "artifact",
    title: "記憶交換市集",
    english: "MEMORY MARKET",
    position: [5.9, 0, 17.3],
    accent: "#fb7185",
    prompt: "市集攤位正在交換還沒發生的回憶",
    response: "有人用童年換一段未來旅行，有人只買了一個問題。這個市集讓外星居民用想像力交易，而不是用貨幣。",
    trait: "價值不只來自物品，也來自觀點",
    collisionRadius: 1.35,
  },
  {
    id: "monorail-station",
    kind: "artifact",
    title: "反重力環線站",
    english: "GRAVITY LOOP",
    position: [0.5, 0, 18.2],
    accent: "#7dd3fc",
    prompt: "環線列車沒有軌道也準時抵達",
    response: "站台漂浮在地表上方，路線會依照乘客今天最需要的風景重新排列。這顆星球的交通也不相信固定路線。",
    trait: "移動是城市的思考方式",
    collisionRadius: 1.45,
  },
  {
    id: "flying-cow",
    kind: "creature",
    title: "飛天牛",
    english: "AEROCOW",
    position: [4.9, 2.7, 16.3],
    accent: "#e0f2fe",
    prompt: "有一頭牛正在用反重力打嗝",
    response: "飛天牛慢慢眨眼：牠只吃明天才會長出來的草。牠代表水瓶座把荒謬當作原型測試的那一面。",
    trait: "把不可能先養起來",
    collisionRadius: 0,
  },
  {
    id: "signal-jellyfish",
    kind: "creature",
    title: "星訊水母",
    english: "SIGNAL JELLYFISH",
    position: [-1.3, 2.2, 7.6],
    accent: "#c4b5fd",
    prompt: "透明觸手正在接收宇宙通知",
    response: "星訊水母發出一段沒有語法的亮光。你不確定它在說什麼，但你突然知道下一步應該往哪裡走。",
    trait: "用直覺接收未來信號",
    collisionRadius: 0,
  },
  {
    id: "quantum-deer",
    kind: "creature",
    title: "量子鹿",
    english: "QUANTUM DEER",
    position: [16.7, 0, -10.7],
    accent: "#b7f7ff",
    prompt: "牠同時看著你和另一個可能的你",
    response: "量子鹿的角分裂成兩條星路。牠提醒你：選擇不是關門，而是在多個版本的自己之間建立通道。",
    trait: "同時相信多種可能",
    collisionRadius: 0.95,
  },
  {
    id: "bubble-dog",
    kind: "creature",
    title: "泡泡犬",
    english: "BUBBLE DOG",
    position: [2.1, 0, 2.4],
    accent: "#c4b5fd",
    prompt: "泡泡犬正在替行人保存迷路的念頭",
    response: "牠搖尾巴時，身邊冒出幾顆裝著問號的泡泡。水瓶城市裡連寵物都不只陪伴，還會幫大家暫存還沒想清楚的問題。",
    trait: "把疑問當成寵物球",
    collisionRadius: 0.82,
  },
  {
    id: "solar-sheep",
    kind: "creature",
    title: "太陽綿羊",
    english: "SOLAR SHEEP",
    position: [-18.0, 0, -10.1],
    accent: "#f6d365",
    prompt: "牠的羊毛正在幫路燈充電",
    response: "太陽綿羊安靜地發光，身上的方塊羊毛像迷你電池。牠們白天吃光，晚上吐出一點溫柔的電。",
    trait: "把能量養成毛茸茸的公共設施",
    collisionRadius: 0.95,
  },
  {
    id: "paper-ray",
    kind: "creature",
    title: "紙鰩",
    english: "PAPER RAY",
    position: [-14.2, 1.7, 6.4],
    accent: "#fb7185",
    prompt: "紙鰩從屋頂滑翔，背上印著未寄出的告白",
    response: "牠像一張會呼吸的紙飛機，繞著城市屋頂巡航。據說牠會把沒說出口的話摺成安全的形狀，等主人準備好再送回來。",
    trait: "讓秘密先在空中練習飛行",
    collisionRadius: 0,
  },
];

export const NPCS: NpcData[] = [
  {
    id: "humanitarian",
    title: "人道主義者",
    english: "THE HUMANITARIAN",
    model: "/assets/cube-world/characters/Character_Female_2.gltf",
    region: "生命之泉",
    position: [13.2, 0, 9.7],
    facing: -0.35,
    color: "#f7e7b4",
    accent: "#74f0d4",
    quote: "文明的高度，不在於誰飛得最遠，而在於有沒有人被留在地面。",
    keywords: ["平等", "博愛", "社會理想", "同理心"],
    core: "相信真正的進步不是少數人走得更快，而是所有人都能前進。",
    strength: "把群體的需求放進未來藍圖，讓理想不只停留在口號。",
    shadow: "容易為了大局忽略自己的疲憊，也可能對不願改變的人失去耐心。",
    relation: "他提醒其他水瓶：自由若不能分享，就會變成另一種孤島。",
    fragment: "生命之泉碎片",
  },
  {
    id: "inventor",
    title: "怪點子發明家",
    english: "THE INVENTOR",
    model: "/assets/cube-world/characters/Character_Male_1.gltf",
    region: "星象機械工坊",
    position: [-14.7, 0, -7.3],
    facing: 1.3,
    color: "#f5b84b",
    accent: "#7dd3fc",
    quote: "它現在還沒有用途，但這並不代表它沒有存在的必要。",
    keywords: ["創造力", "腦洞", "實驗精神", "好奇心"],
    core: "把古代星象儀器拆開，再改造成連自己都不知道用途的機器。",
    strength: "願意在失敗裡挖出下一個原型，讓不合理的想法先活下來。",
    shadow: "太迷戀可能性，容易忘記收尾，也可能把別人的耐心當燃料。",
    relation: "他替未來派做工具，也替駭客製造新的漏洞。",
    fragment: "黃銅星輪碎片",
  },
  {
    id: "hacker",
    title: "系統解構者",
    english: "THE HACKER",
    model: "/assets/cube-world/characters/Character_Male_2.gltf",
    region: "隱藏資料庫",
    position: [-17.2, 0, -5.9],
    facing: 0.8,
    color: "#5eead4",
    accent: "#b7f7ff",
    quote: "沒有完美的系統，只有還沒被理解的漏洞。",
    keywords: ["解構", "規則", "邏輯", "漏洞"],
    core: "先理解制度，再找到它的裂縫。",
    strength: "能看見規則背後的架構，替團隊打開更聰明的路徑。",
    shadow: "若只享受破解，可能忘記系統裡也住著真實的人。",
    relation: "他和觀察者共享冷靜，但更願意動手改寫規則。",
    fragment: "資料裂隙碎片",
  },
  {
    id: "rebel",
    title: "叛逆藝術家",
    english: "THE REBEL ARTIST",
    model: "/assets/cube-world/characters/Character_Female_1.gltf",
    region: "破碎藝術神殿",
    position: [-13.4, 0, 7.2],
    facing: -1.4,
    color: "#fb7185",
    accent: "#c084fc",
    quote: "規則不是永恆，只是有人比你更早留下筆跡。",
    keywords: ["自由", "反傳統", "獨立", "審美顛覆"],
    core: "不相信既有規則，會在神殿牆面重新畫上自己的星圖。",
    strength: "敢把世界看成可重畫的草圖，讓被壓住的聲音重新發亮。",
    shadow: "若只為反對而反對，容易把真正的自由變成另一種姿態。",
    relation: "他和漫遊者一樣討厭固定路線，但更想改寫城市牆面。",
    fragment: "紫紅壁畫碎片",
  },
  {
    id: "futurist",
    title: "未來預言者",
    english: "THE FUTURIST",
    model: "/assets/cube-world/characters/Character_Male_2.gltf",
    region: "星際觀測台",
    position: [0, 0, -15.5],
    facing: 0,
    color: "#dcecff",
    accent: "#7dd3fc",
    quote: "你們稱它為未來，只是因為還沒有人先抵達。",
    keywords: ["前瞻", "科技", "想像力", "理想主義"],
    core: "總是在觀察尚未發生的世界，對現在的秩序缺乏耐心。",
    strength: "能替眾人看見尚未成形的可能，並把遠方變成藍圖。",
    shadow: "可能太急著抵達明天，而錯過此刻需要被照顧的人。",
    relation: "他需要人道主義者提醒方向，也需要發明家替預言造出工具。",
    fragment: "藍色全息碎片",
  },
  {
    id: "observer",
    title: "冷靜觀察者",
    english: "THE OBSERVER",
    model: "/assets/cube-world/characters/Character_Female_2.gltf",
    region: "中央上層平台",
    position: [4.9, 0, -15.1],
    facing: -0.55,
    color: "#9db4ff",
    accent: "#c7d2fe",
    quote: "人們總在回答問題之前，先暴露自己真正害怕的事。",
    keywords: ["理性", "分析", "疏離", "洞察"],
    core: "幾乎不主動說話，但會觀察玩家走過的每一條路。",
    strength: "能在混亂裡迅速看出核心問題，不被表象拖著走。",
    shadow: "過度抽離時，洞察會變成距離，沉默也會變成冷漠。",
    relation: "他理解駭客的邏輯，也看穿藝術家的防衛。",
    fragment: "單眼星鏡碎片",
  },
  {
    id: "visionary",
    title: "星際哲學家",
    english: "THE VISIONARY",
    model: "/assets/cube-world/characters/Character_Male_1.gltf",
    region: "圓形哲思大廳",
    position: [10.7, 0, -6.9],
    facing: 0.35,
    color: "#c4b5fd",
    accent: "#f7d9ff",
    quote: "也許不是我們活在時間裡，而是時間正在經過我們。",
    keywords: ["哲思", "宇宙觀", "精神探索", "抽象思考"],
    core: "研究人類、時間與宇宙之間的關係，說話經常像謎語。",
    strength: "能把短暫的人生問題放進更大的尺度，讓痛苦長出意義。",
    shadow: "太常仰望宇宙時，可能忘記腳下的人正在等一句明白話。",
    relation: "他把未來派的藍圖變成問題，也把觀察者的沉默變成詩。",
    fragment: "星環文字碎片",
  },
  {
    id: "wanderer",
    title: "自由漫遊者",
    english: "THE WANDERER",
    model: "/assets/cube-world/characters/Character_Female_1.gltf",
    region: "風之橋",
    position: [0, 0, 14.6],
    facing: Math.PI,
    color: "#f6d365",
    accent: "#e0f2fe",
    quote: "你一直在問要去哪裡，卻忘了有些道路本身就是答案。",
    keywords: ["自由", "探索", "流動", "未知"],
    core: "從未在同一個星球停留太久，也不認為人生需要固定目的地。",
    strength: "能用移動打開新的感官，不被既定地圖困住。",
    shadow: "若把停留視為束縛，可能也錯過了深度連結。",
    relation: "他替所有水瓶記得：方向感不等於固定路線。",
    fragment: "風橋星塵碎片",
  },
];

export const DIALOGUE_QUESTIONS = [
  { id: "strength", label: "你的力量是什麼？" },
  { id: "shadow", label: "你的弱點是什麼？" },
  { id: "relation", label: "你如何看待其他水瓶？" },
] as const;

export const WORLD_REGIONS = [
  { name: "Aquarius Plaza 水瓶中央廣場", x: 0, z: 0, radius: 7 },
  { name: "Future Observatory 未來觀測區", x: 0, z: -17, radius: 7 },
  { name: "Innovation Workshop 創新工坊區", x: -14, z: -8, radius: 7 },
  { name: "Cosmic Research 星際研究區", x: 14, z: -9, radius: 7 },
  { name: "Rebel Art Quarter 叛逆藝術街區", x: -14, z: 8, radius: 7 },
  { name: "Humanity Garden 人道花園區", x: 14, z: 9, radius: 7 },
  { name: "Canal Harbor 水道港灣區", x: 0, z: 17, radius: 7 },
];
