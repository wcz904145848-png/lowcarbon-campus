/* 数据层：所有数值只在这里改，代码里不出现平衡数字 */
const DATA = {
  goalCarbon: 9.0,
  dayLimit: 3,
  energyPerDay: 4,
  boxCost: 30,
  seedCost: 60,
  waterCost: 10,
  coopClaimAt: 0.6,

  /* 排放因子：kg CO2e / 单位。demo=true 的必须在界面上标注「演示假设」 */
  factors: {
    car:      { name: "乘汽车",    unit: "km", kg: 0.200, demo: true  },
    walk:     { name: "步行",      unit: "km", kg: 0.000, demo: false },
    bike:     { name: "骑行",      unit: "km", kg: 0.000, demo: false },
    newBook:  { name: "购买新书",  unit: "本", kg: 1.800, demo: true  },
    usedBook: { name: "二手循环",  unit: "本", kg: 0.300, demo: false },
    cupOnce:  { name: "一次性水杯",unit: "个", kg: 0.030, demo: true  },
    cupOwn:   { name: "自带水杯",  unit: "个", kg: 0.000, demo: false },
    grid:     { name: "电网用电",  unit: "度", kg: 0.785, demo: false },
    solar:    { name: "零碳用电",  unit: "度", kg: 0.000, demo: false },
    beef:     { name: "荤食一餐",  unit: "餐", kg: 3.600, demo: true  },
    veg:      { name: "素食一餐",  unit: "餐", kg: 1.600, demo: false }
  },

  /* 任务：saving = qty × (基准因子 − 实际因子) */
  tasks: [
    { id: "walkToClass", title: "步行去上课", sub: "步行累计路程", loc: "教学楼",
      icon: "🚶", kind: "km", qty: 2.0, min: 0.5, max: 6, step: 0.5,
      base: "car", act: "walk", coins: 10 },
    { id: "bikeToClass", title: "骑车去上课", sub: "骑行累计路程", loc: "教学楼",
      icon: "🚲", kind: "km", qty: 1.5, min: 0.5, max: 6, step: 0.5,
      base: "car", act: "bike", coins: 8 },
    { id: "savePower", title: "节约用电", sub: "随手关灯", loc: "宿舍",
      icon: "💡", kind: "度", qty: 1, min: 1, max: 4, step: 1,
      base: "grid", act: "solar", coins: 8 },
    { id: "oldBook", title: "旧书循环", sub: "旧书籍 1 本", loc: "教学楼",
      icon: "📚", kind: "本", qty: 1, min: 1, max: 3, step: 1,
      base: "newBook", act: "usedBook", coins: 12 },
    { id: "ownCup", title: "自带水杯", sub: "减少一次性用品", loc: "食堂",
      icon: "🥤", kind: "个", qty: 5, min: 1, max: 8, step: 1,
      base: "cupOnce", act: "cupOwn", coins: 8 },
    { id: "vegMeal", title: "食堂素食", sub: "一餐不吃肉", loc: "食堂",
      icon: "🥬", kind: "餐", qty: 1, min: 1, max: 2, step: 1,
      base: "beef", act: "veg", coins: 14 }
  ],

  /* 活动任务：整局只能做一次 */
  events: [
    { id: "paperless", title: "无纸化课堂", sub: "全程用平板记笔记", loc: "教学楼",
      icon: "📝", kind: "次", qty: 1, min: 1, max: 1, step: 1,
      base: "newBook", act: "usedBook", coins: 16, once: true },
    { id: "recycleCloth", title: "旧衣回收", sub: "捐出闲置衣物", loc: "宿舍区",
      icon: "👕", kind: "件", qty: 3, min: 1, max: 6, step: 1,
      base: "newBook", act: "usedBook", coins: 18, once: true }
  ],

  locations: [
    { id: "path",  name: "林荫步道", x: 30, y: 62 },
    { id: "teach", name: "教学楼",   x: 66, y: 30 },
    { id: "canteen", name: "食堂",   x: 40, y: 86 }
  ],

  stages: ["种子", "幼苗", "小树", "成树", "盛放"],
  stageAt: [0, 10, 25, 45, 70],

  plants: {
    sakura:      { name: "樱花",   season: "春季", type: "观赏型", art: "plant_sakura2.png",  rare: 2, stageArt: true },
    ginkgo:      { name: "银杏",   season: "秋季", type: "观赏型", art: "plant_ginkgo.png",   rare: 2 },
    osmanthus:   { name: "桂花",   season: "秋季", type: "香氛型", art: "plant_osmanthus.png",rare: 2 },
    crape:       { name: "紫薇",   season: "夏季", type: "观赏型", art: "plant_crape.png",    rare: 3 },
    magnolia:    { name: "玉兰",   season: "春季", type: "观赏型", art: "plant_magnolia.png", rare: 3 },
    metasequoia: { name: "水杉",   season: "秋季", type: "防护型", art: "plant_metasequoia.png", rare: 3 },
    rose:        { name: "月季",   season: "全年", type: "观赏型", art: "plant_rose.png",     rare: 1 },
    sunflower:   { name: "向日葵", season: "夏季", type: "作物型", art: "plant_sunflower.png",rare: 1 }
  },
  plantOrder: ["sakura", "ginkgo", "osmanthus", "crape", "magnolia", "metasequoia", "rose", "sunflower"],

  /* ---- 农田（花园页）---- */
  plotCount: 16,
  plotCols: 5,
  cropStageAt: [0, 3, 8, 15, 24],
  waterCost: 5,
  waterGain: 3,
  fertCost: 15,
  fertGain: 8,
  expNeed: [60, 150, 280, 450],
  basePlots: 8,

  cropSet: ["hua", "ying", "yang"],
  cropNames: { hua: "樱花", ying: "樱树", yang: "杨树" },
  cropPrice: { hua: 24, ying: 20, yang: 18 },
  cropYield: { hua: 60, ying: 52, yang: 46 },
  cropExp:   { hua: 14, ying: 12, yang: 11 },

  crops: {
    sakura:      { seed: 24, coins: 60, exp: 14 },
    ginkgo:      { seed: 20, coins: 52, exp: 12 },
    osmanthus:   { seed: 18, coins: 46, exp: 11 },
    crape:       { seed: 26, coins: 66, exp: 15 },
    magnolia:    { seed: 26, coins: 66, exp: 15 },
    metasequoia: { seed: 22, coins: 56, exp: 13 },
    rose:        { seed: 14, coins: 36, exp: 9 },
    sunflower:   { seed: 12, coins: 32, exp: 8 }
  },

  npcs: [
    { id: "lin",   name: "小林同学", seed: "osmanthus", have: 3, want: "sakura",    img: "npc_0.png" },
    { id: "nai",   name: "草莓奶盖", seed: "crape",     have: 4, want: "ginkgo",    img: "npc_1.png" },
    { id: "wang",  name: "设计小王", seed: "rose",      have: 4, want: "sunflower", img: "npc_2.png" }
  ]
};

