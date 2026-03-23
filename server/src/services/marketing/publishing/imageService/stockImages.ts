// ---------------------------------------------------------------------------
// [STOCK] tag router — curated Unsplash photography
// ---------------------------------------------------------------------------

const CURATED_STOCK: Record<string, string[]> = {
  business_meeting: [
    'https://images.unsplash.com/photo-1552664730-d307ca884978?w=1200',
    'https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=1200',
    'https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=1200',
  ],
  office_modern: [
    'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200',
    'https://images.unsplash.com/photo-1497215842964-222b430dc094?w=1200',
    'https://images.unsplash.com/photo-1604328698692-f76ea9498e76?w=1200',
  ],
  team_diverse: [
    'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1200',
    'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=1200',
    'https://images.unsplash.com/photo-1543269865-cbf427effbad?w=1200',
  ],
  startup_workspace: [
    'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=1200',
    'https://images.unsplash.com/photo-1553877522-43269d4ea984?w=1200',
    'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=1200',
  ],
  food_lifestyle: [
    'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=1200',
    'https://images.unsplash.com/photo-1493770348161-369560ae357d?w=1200',
    'https://images.unsplash.com/photo-1476224203421-9ac39bcb3327?w=1200',
  ],
  coffee_cafe: [
    'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=1200',
    'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=1200',
    'https://images.unsplash.com/photo-1442512595331-e89e73853f31?w=1200',
  ],
  restaurant: [
    'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200',
    'https://images.unsplash.com/photo-1552566626-52f8b828add9?w=1200',
    'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1200',
  ],
  cooking: [
    'https://images.unsplash.com/photo-1556910103-1c02745aae4d?w=1200',
    'https://images.unsplash.com/photo-1507048331197-7d4ac70811cf?w=1200',
    'https://images.unsplash.com/photo-1466637574441-749b8f19452f?w=1200',
  ],
  fashion_model: [
    'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=1200',
    'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=1200',
    'https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=1200',
  ],
  beauty: [
    'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=1200',
    'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=1200',
    'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=1200',
  ],
  fitness: [
    'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1200',
    'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=1200',
    'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=1200',
  ],
  wellness: [
    'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=1200',
    'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=1200',
    'https://images.unsplash.com/photo-1545205597-3d9d02c29597?w=1200',
  ],
  city_skyline: [
    'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=1200',
    'https://images.unsplash.com/photo-1514565131-fce0801e5785?w=1200',
    'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=1200',
  ],
  architecture: [
    'https://images.unsplash.com/photo-1487958449943-2429e8be8625?w=1200',
    'https://images.unsplash.com/photo-1431576901776-e539bd916ba2?w=1200',
    'https://images.unsplash.com/photo-1479839672679-a46483c0e7c8?w=1200',
  ],
  street: [
    'https://images.unsplash.com/photo-1476973422084-e0fa66ff9456?w=1200',
    'https://images.unsplash.com/photo-1444723121867-7a241cacace9?w=1200',
    'https://images.unsplash.com/photo-1519501025264-65ba15a82390?w=1200',
  ],
  travel: [
    'https://images.unsplash.com/photo-1488085061387-422e29b40080?w=1200',
    'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=1200',
    'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1200',
  ],
  nature_landscape: [
    'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1200',
    'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=1200',
    'https://images.unsplash.com/photo-1472214103451-9374bd1c798e?w=1200',
  ],
  ocean_beach: [
    'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1200',
    'https://images.unsplash.com/photo-1519046904884-53103b34b206?w=1200',
    'https://images.unsplash.com/photo-1505228395891-9a51e7e86bf6?w=1200',
  ],
  mountain: [
    'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1200',
    'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200',
    'https://images.unsplash.com/photo-1454496522488-7a8e488e8606?w=1200',
  ],
  forest: [
    'https://images.unsplash.com/photo-1448375240586-882707db888b?w=1200',
    'https://images.unsplash.com/photo-1542273917363-3b1817f69a2d?w=1200',
    'https://images.unsplash.com/photo-1473448912268-2022ce9509d8?w=1200',
  ],
  desert: [
    'https://images.unsplash.com/photo-1509316785289-025f5b846b35?w=1200',
    'https://images.unsplash.com/photo-1473580044384-7ba9967e16a0?w=1200',
    'https://images.unsplash.com/photo-1547234935-80c7145ec969?w=1200',
  ],
  technology: [
    'https://images.unsplash.com/photo-1518770660439-4636190af475?w=1200',
    'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=1200',
    'https://images.unsplash.com/photo-1531297484001-80022131f5a1?w=1200',
  ],
  laptop_workspace: [
    'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=1200',
    'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=1200',
    'https://images.unsplash.com/photo-1488590528505-98d2b5aba04b?w=1200',
  ],
  coding: [
    'https://images.unsplash.com/photo-1461749280684-dccba630e2f6?w=1200',
    'https://images.unsplash.com/photo-1555099962-4199c345e5dd?w=1200',
    'https://images.unsplash.com/photo-1516116216624-53e697fedbea?w=1200',
  ],
  ecommerce_product: [
    'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1200',
    'https://images.unsplash.com/photo-1472851294608-062f824d29cc?w=1200',
    'https://images.unsplash.com/photo-1607082349566-187342175e2f?w=1200',
  ],
  packaging: [
    'https://images.unsplash.com/photo-1605000797499-95a51c5269ae?w=1200',
    'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=1200',
    'https://images.unsplash.com/photo-1586880244386-8b3e34c8382c?w=1200',
  ],
  retail: [
    'https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?w=1200',
    'https://images.unsplash.com/photo-1567401893414-76b7b1e5a7a5?w=1200',
    'https://images.unsplash.com/photo-1555529669-e69e7aa0ba9a?w=1200',
  ],
  event_conference: [
    'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1200',
    'https://images.unsplash.com/photo-1505373877841-8d25f7d46678?w=1200',
    'https://images.unsplash.com/photo-1475721027785-f74eccf877e2?w=1200',
  ],
  celebration: [
    'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=1200',
    'https://images.unsplash.com/photo-1496024840928-4c417adf211d?w=1200',
    'https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=1200',
  ],
  education: [
    'https://images.unsplash.com/photo-1523050854058-8df90110c476?w=1200',
    'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=1200',
    'https://images.unsplash.com/photo-1509062522246-3755977927d7?w=1200',
  ],
  healthcare: [
    'https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=1200',
    'https://images.unsplash.com/photo-1538108149393-fbbd81895907?w=1200',
    'https://images.unsplash.com/photo-1559757175-5700dde675bc?w=1200',
  ],
  finance: [
    'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=1200',
    'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200',
    'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=1200',
  ],
  real_estate: [
    'https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=1200',
    'https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=1200',
    'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=1200',
  ],
  automotive: [
    'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=1200',
    'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=1200',
    'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=1200',
  ],
  sustainability: [
    'https://images.unsplash.com/photo-1473773508845-188df298d2d1?w=1200',
    'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=1200',
    'https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?w=1200',
  ],
  pet_animal: [
    'https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=1200',
    'https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=1200',
    'https://images.unsplash.com/photo-1415369629372-26f2fe60c467?w=1200',
  ],
  music_art: [
    'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=1200',
    'https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=1200',
    'https://images.unsplash.com/photo-1507838153414-b4b713384a76?w=1200',
  ],
  sports: [
    'https://images.unsplash.com/photo-1461896836934-bd45ba8b0e28?w=1200',
    'https://images.unsplash.com/photo-1517649763962-0c623066013b?w=1200',
    'https://images.unsplash.com/photo-1541534741688-6078c6bfb5c5?w=1200',
  ],
  family_parenting: [
    'https://images.unsplash.com/photo-1476703993599-0035a21b17a9?w=1200',
    'https://images.unsplash.com/photo-1609220136736-443140cffec6?w=1200',
    'https://images.unsplash.com/photo-1536640712-4d4c36ff0e4e?w=1200',
  ],
};

const STOCK_KEYWORD_MAP: Record<string, string> = {
  team: 'team_diverse', teams: 'team_diverse', people: 'team_diverse', diverse: 'team_diverse',
  collaborate: 'team_diverse', collaboration: 'team_diverse', coworking: 'startup_workspace',
  office: 'office_modern', workspace: 'laptop_workspace', desk: 'laptop_workspace',
  startup: 'startup_workspace', cowork: 'startup_workspace',
  meeting: 'business_meeting', boardroom: 'business_meeting', conference: 'event_conference',
  food: 'food_lifestyle', meal: 'food_lifestyle', dish: 'food_lifestyle', eating: 'food_lifestyle',
  coffee: 'coffee_cafe', cafe: 'coffee_cafe', latte: 'coffee_cafe', espresso: 'coffee_cafe',
  brew: 'coffee_cafe', barista: 'coffee_cafe',
  restaurant: 'restaurant', dining: 'restaurant', chef: 'cooking', cook: 'cooking',
  kitchen: 'cooking', recipe: 'cooking',
  fashion: 'fashion_model', model: 'fashion_model', outfit: 'fashion_model', clothing: 'fashion_model',
  beauty: 'beauty', skincare: 'beauty', makeup: 'beauty', cosmetic: 'beauty',
  fitness: 'fitness', gym: 'fitness', workout: 'fitness', exercise: 'fitness',
  yoga: 'wellness', meditation: 'wellness', wellness: 'wellness', mindful: 'wellness',
  spa: 'wellness', relax: 'wellness', health: 'healthcare',
  city: 'city_skyline', skyline: 'city_skyline', urban: 'street', downtown: 'city_skyline',
  architecture: 'architecture', building: 'architecture',
  street: 'street', alley: 'street', neighborhood: 'street',
  travel: 'travel', vacation: 'travel', holiday: 'travel', destination: 'travel',
  nature: 'nature_landscape', landscape: 'nature_landscape', outdoor: 'nature_landscape',
  ocean: 'ocean_beach', beach: 'ocean_beach', sea: 'ocean_beach', coast: 'ocean_beach',
  wave: 'ocean_beach', surf: 'ocean_beach',
  mountain: 'mountain', hiking: 'mountain', summit: 'mountain', trail: 'mountain',
  forest: 'forest', tree: 'forest', wood: 'forest', jungle: 'forest',
  desert: 'desert', sand: 'desert', dune: 'desert',
  tech: 'technology', technology: 'technology', digital: 'technology', innovation: 'technology',
  laptop: 'laptop_workspace', computer: 'laptop_workspace', developer: 'coding',
  code: 'coding', programming: 'coding', software: 'coding', engineer: 'coding',
  ecommerce: 'ecommerce_product', shop: 'retail', store: 'retail', shopping: 'retail',
  product: 'ecommerce_product', unboxing: 'packaging', package: 'packaging',
  event: 'event_conference', seminar: 'event_conference',
  party: 'celebration', celebrate: 'celebration', festive: 'celebration', wedding: 'celebration',
  school: 'education', learn: 'education', student: 'education', university: 'education',
  medical: 'healthcare', doctor: 'healthcare', hospital: 'healthcare', clinic: 'healthcare',
  finance: 'finance', money: 'finance', invest: 'finance', banking: 'finance',
  real_estate: 'real_estate', house: 'real_estate', home: 'real_estate', property: 'real_estate',
  apartment: 'real_estate', interior: 'real_estate',
  car: 'automotive', vehicle: 'automotive', driving: 'automotive', auto: 'automotive',
  green: 'sustainability', eco: 'sustainability', sustainable: 'sustainability',
  recycle: 'sustainability', environment: 'sustainability', solar: 'sustainability',
  pet: 'pet_animal', dog: 'pet_animal', cat: 'pet_animal', animal: 'pet_animal',
  music: 'music_art', concert: 'music_art', art: 'music_art', gallery: 'music_art',
  sport: 'sports', running: 'sports', athlete: 'sports', game: 'sports',
  family: 'family_parenting', parent: 'family_parenting', child: 'family_parenting',
  baby: 'family_parenting', kid: 'family_parenting',
};

/**
 * Parse a `[STOCK]`-prefixed prompt and resolve to a curated Unsplash URL.
 * Returns `null` if the prompt does not start with `[STOCK]` or no category matches.
 */
export function resolveStockImageUrl(prompt: string): string | null {
  const trimmed = prompt.trim();
  if (!trimmed.startsWith('[STOCK]')) return null;

  const body = trimmed.slice('[STOCK]'.length).trim().toLowerCase();
  if (!body) return null;

  const words = body.split(/[\s,.\-_/]+/).filter((w) => w.length > 2);

  let bestCategory: string | null = null;
  let bestScore = 0;

  for (const word of words) {
    const category = STOCK_KEYWORD_MAP[word];
    if (category) {
      const score = word.length;
      if (score > bestScore) {
        bestScore = score;
        bestCategory = category;
      }
    }
  }

  if (!bestCategory) {
    bestCategory = 'office_modern';
  }

  const urls = CURATED_STOCK[bestCategory];
  if (!urls || urls.length === 0) return null;

  let hash = 0;
  for (let i = 0; i < body.length; i++) {
    hash = ((hash << 5) - hash + body.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % urls.length;
  return urls[idx];
}
