// Starter taxonomy so autocomplete works on day one. Lithuanian first, English
// name + aliases for mixing. The family's own catalog grows from here (typed
// items, DeepSeek-classified items); seed rows are only inserted once (by
// seed_key) and never overwrite edits.
//
// Product line format: "name|english|alias, alias|*"  (* = staple: shown as a
// suggestion before there is any purchase history).

export type SeedCategory = {
  id: string;
  nameLt: string;
  nameEn: string;
  emoji: string;
  kind: "GROCERY" | "LONGTERM";
  products: string[];
};

export const SEED_CATEGORIES: SeedCategory[] = [
  {
    id: "vaisiai", nameLt: "Vaisiai ir daržovės", nameEn: "Fruit & vegetables", emoji: "🍎", kind: "GROCERY",
    products: [
      "obuoliai|apples|obuolys|*", "bananai|bananas|bananas|*", "apelsinai|oranges|apelsinas", "mandarinai|tangerines|mandarinas, klementinai",
      "citrinos|lemons|citrina", "laimai|limes|laimas", "kriaušės|pears|kriaušė", "vynuogės|grapes", "braškės|strawberries|braškė",
      "mėlynės|blueberries", "avietės|raspberries", "arbūzas|watermelon", "melionas|melon", "persikai|peaches|persikas, nektarinai",
      "slyvos|plums", "kiviai|kiwi|kivis", "ananasas|pineapple", "mangai|mango|mangas", "avokadai|avocado|avokadas",
      "pomidorai|tomatoes|pomidoras|*", "vyšniniai pomidorai|cherry tomatoes|cherry pomidorai", "agurkai|cucumbers|agurkas|*",
      "paprikos|bell peppers|paprika, pipirai", "bulvės|potatoes|bulvė|*", "saldžiosios bulvės|sweet potatoes|batatai",
      "svogūnai|onions|svogūnas|*", "raudonieji svogūnai|red onions", "laiškiniai svogūnai|spring onions|žali svogūnai",
      "česnakai|garlic|česnakas", "morkos|carrots|morka|*", "burokėliai|beetroot|burokai", "kopūstai|cabbage|kopūstas",
      "brokoliai|broccoli", "žiedinis kopūstas|cauliflower|kalafioras", "cukinijos|zucchini|cukinija, courgette",
      "baklažanai|aubergine|baklažanas, eggplant", "salotos|lettuce|salota, salad", "rukola|rocket|arugula",
      "špinatai|spinach", "krapai|dill", "petražolės|parsley", "bazilikas|basil", "kalendra|coriander|cilantro",
      "pievagrybiai|mushrooms|grybai, champignons", "kukurūzai|sweet corn|kukurūzas", "porai|leek|poras", "salierai|celery|saliera",
      "ridikėliai|radishes", "imbieras|ginger", "moliūgas|pumpkin|squash",
    ],
  },
  {
    id: "duona", nameLt: "Duona ir kepiniai", nameEn: "Bread & bakery", emoji: "🥖", kind: "GROCERY",
    products: [
      "duona|bread|juoda duona, ruginė duona|*", "batonas|white loaf|balta duona", "bagetė|baguette|bagete",
      "skrebučiai|toast bread|tostai, toast", "batonėliai|bread rolls|bandelės, rolls", "tortilijos|tortillas|tortilija, wraps",
      "pita|pita bread", "croissantai|croissants|kruasanai, raguoliai", "pyragas|cake|pyragėlis", "trapučiai|crispbread|duonelės",
    ],
  },
  {
    id: "pieno", nameLt: "Pieno produktai ir kiaušiniai", nameEn: "Dairy & eggs", emoji: "🥛", kind: "GROCERY",
    products: [
      "pienas|milk|pieno, leche, leite|*", "augalinis pienas|plant milk|avižų pienas, oat milk, migdolų pienas",
      "kiaušiniai|eggs|kiaušinis, huevos, ovos|*", "sviestas|butter|sviesto, mantequilla|*", "sūris|cheese|sūrio, queso, queijo|*",
      "tarkuotas sūris|grated cheese", "mocarela|mozzarella", "parmezanas|parmesan", "fetos sūris|feta",
      "varškė|cottage cheese|varškės, quark", "grietinė|sour cream|grietinės", "jogurtas|yoghurt|jogurtai, yogurt|*",
      "graikiškas jogurtas|greek yoghurt", "kefyras|kefir", "grietinėlė|cream|grietinėlės, nata", "sūrelis|curd snack|sūreliai",
      "lydytas sūris|cream cheese|kreminis sūris, philadelphia", "margarinas|margarine",
    ],
  },
  {
    id: "mesa", nameLt: "Mėsa ir paukštiena", nameEn: "Meat & poultry", emoji: "🥩", kind: "GROCERY",
    products: [
      "vištiena|chicken|vištienos, pollo, frango|*", "vištienos krūtinėlė|chicken breast|filė", "vištienos šlaunelės|chicken thighs|kulšelės",
      "kiauliena|pork|kiaulienos, cerdo", "jautiena|beef|jautienos, ternera", "malta mėsa|minced meat|faršas, mince, carne picada",
      "kalakutiena|turkey|kalakutienos", "šoninė|bacon|bekonas", "kepsniai|steaks|steak", "šašlykas|kebab meat|šašlykai",
    ],
  },
  {
    id: "deli", nameLt: "Dešros ir kumpiai", nameEn: "Deli & sausages", emoji: "🥓", kind: "GROCERY",
    products: [
      "dešrelės|sausages|dešrelių, sosiskos", "dešra|salami|rūkyta dešra", "kumpis|ham|kumpio, jamón, fiambre",
      "virta dešra|cooked sausage", "chorizo|chorizo", "pašteta|pâté|paštetas",
    ],
  },
  {
    id: "zuvis", nameLt: "Žuvis", nameEn: "Fish & seafood", emoji: "🐟", kind: "GROCERY",
    products: [
      "lašiša|salmon|lašišos, salmón", "menkė|cod|bacalao, bacalhau", "silkė|herring|silkės", "krevetės|prawns|shrimp, gambas",
      "tunas|tuna (fresh)|tunas šviežias", "rūkyta žuvis|smoked fish", "kalmarai|squid|calamares",
    ],
  },
  {
    id: "saldyti", nameLt: "Šaldyti produktai", nameEn: "Frozen", emoji: "🧊", kind: "GROCERY",
    products: [
      "ledai|ice cream|ledų, helado", "šaldytos daržovės|frozen vegetables", "šaldyta pica|frozen pizza|pica",
      "koldūnai|dumplings|virtiniai, pelmeni", "bulvytės|frozen fries|fri, chips", "šaldytos uogos|frozen berries", "ledukai|ice cubes|ledas",
    ],
  },
  {
    id: "kruopos", nameLt: "Kruopos, makaronai, miltai", nameEn: "Pasta, rice & baking", emoji: "🍝", kind: "GROCERY",
    products: [
      "makaronai|pasta|spagečiai, spaghetti|*", "ryžiai|rice|ryžių, arroz|*", "grikiai|buckwheat|grikių",
      "avižiniai dribsniai|oats|avižos, košė, porridge", "miltai|flour|miltų, harina", "cukrus|sugar|cukraus, azúcar",
      "kuskusas|couscous", "bulgūras|bulgur", "lęšiai|lentils|lentejas", "kepimo milteliai|baking powder",
      "mielės|yeast", "vanilinis cukrus|vanilla sugar", "džiūvėsėliai|breadcrumbs", "makaronai lakštiniai|noodles|lakštiniai",
    ],
  },
  {
    id: "konservai", nameLt: "Konservai ir padažai", nameEn: "Tins, jars & sauces", emoji: "🥫", kind: "GROCERY",
    products: [
      "pomidorų padažas|tomato sauce|passata, tomate frito", "konservuoti pomidorai|tinned tomatoes|pomidorai skardinėje",
      "tuno konservai|tinned tuna|tunas, atún", "pupelės|beans|pupelės konservuotos, alubias", "avinžirniai|chickpeas|garbanzos",
      "kukurūzų konservai|tinned corn", "alyvuogės|olives|aceitunas", "kečupas|ketchup", "majonezas|mayonnaise|majonezo, mayo",
      "garstyčios|mustard", "pesto|pesto", "sojų padažas|soy sauce", "agurkai marinuoti|pickles|rauginti agurkai",
      "uogienė|jam|džemas, mermelada", "medus|honey|miel", "riešutų sviestas|peanut butter|žemės riešutų sviestas",
      "šokoladinis kremas|chocolate spread|nutella", "sultinys|stock cubes|sultinio kubeliai, buljonas",
    ],
  },
  {
    id: "prieskoniai", nameLt: "Aliejus ir prieskoniai", nameEn: "Oil, vinegar & spices", emoji: "🧂", kind: "GROCERY",
    products: [
      "aliejus|oil|saulėgrąžų aliejus, sunflower oil", "alyvuogių aliejus|olive oil|aceite de oliva, azeite",
      "druska|salt|druskos, sal", "pipirai|black pepper|juodieji pipirai", "actas|vinegar|vinagre",
      "paprika malta|paprika powder|pimentón", "prieskoniai|spices|prieskonių mišinys", "cinamonas|cinnamon", "lauro lapai|bay leaves",
    ],
  },
  {
    id: "pusryciai", nameLt: "Kava, arbata, pusryčiai", nameEn: "Coffee, tea & breakfast", emoji: "☕", kind: "GROCERY",
    products: [
      "kava|coffee|kavos, café|*", "kavos pupelės|coffee beans", "kavos kapsulės|coffee capsules|kapsulės", "arbata|tea|arbatos, té",
      "kakava|cocoa", "dribsniai|cereal|kukurūzų dribsniai, cereales", "musli|muesli|granola",
    ],
  },
  {
    id: "saldumynai", nameLt: "Saldumynai ir užkandžiai", nameEn: "Sweets & snacks", emoji: "🍫", kind: "GROCERY",
    products: [
      "šokoladas|chocolate|šokolado", "sausainiai|biscuits|cookies, galletas", "traškučiai|crisps|chips, patatas fritas",
      "riešutai|nuts|riešutų, frutos secos", "saldainiai|sweets|candy", "guminukai|gummies|želė saldainiai",
      "spragėsiai|popcorn", "džiovinti vaisiai|dried fruit|razinos", "batonėliai užkandžiams|snack bars|granola bars",
      "krekeriai|crackers", "vafliai|wafers",
    ],
  },
  {
    id: "gerimai", nameLt: "Gėrimai", nameEn: "Drinks", emoji: "🧃", kind: "GROCERY",
    products: [
      "vanduo|water|vandens, agua, água|*", "gazuotas vanduo|sparkling water|mineralinis", "sultys|juice|sulčių, zumo",
      "apelsinų sultys|orange juice", "limonadas|soft drink|gazuoti gėrimai, soda", "kola|cola|coca cola",
      "gira|kvass", "energetinis gėrimas|energy drink", "ledinė arbata|iced tea",
    ],
  },
  {
    id: "alkoholis", nameLt: "Alkoholis", nameEn: "Alcohol", emoji: "🍷", kind: "GROCERY",
    products: [
      "alus|beer|alaus, cerveza", "vynas|wine|vyno, vino", "raudonas vynas|red wine", "baltas vynas|white wine",
      "putojantis vynas|sparkling wine|cava, šampanas", "sidras|cider",
    ],
  },
  {
    id: "vaikams", nameLt: "Vaikams", nameEn: "Kids & baby", emoji: "🍼", kind: "GROCERY",
    products: [
      "sauskelnės|nappies|pampersai, diapers", "drėgnos servetėlės|wet wipes|servetėlės vaikams", "tyrelės|baby food|vaikiškos tyrelės",
      "vaikiški užkandžiai|kids snacks",
    ],
  },
  {
    id: "higiena", nameLt: "Higiena ir kosmetika", nameEn: "Hygiene & beauty", emoji: "🧴", kind: "GROCERY",
    products: [
      "tualetinis popierius|toilet paper|tualetinio popieriaus, papel higiénico|*", "dantų pasta|toothpaste|pasta dantims",
      "dantų šepetėlis|toothbrush|šepetėlis", "šampūnas|shampoo", "kondicionierius|conditioner", "dušo želė|shower gel|gelis",
      "muilas|soap|skystas muilas", "dezodorantas|deodorant", "kremas nuo saulės|sunscreen|apsauga nuo saulės, protector solar",
      "skutimosi priemonės|razors|skustuvai", "higieniniai paketai|pads|įklotai", "tamponai|tampons", "vatos diskeliai|cotton pads",
      "ausų krapštukai|cotton buds", "popierinės nosinės|tissues|nosinės",
    ],
  },
  {
    id: "buitis", nameLt: "Buitinė chemija ir namų reikmenys", nameEn: "Cleaning & household", emoji: "🧽", kind: "GROCERY",
    products: [
      "indų ploviklis|washing-up liquid|fairy, ploviklis", "skalbimo priemonė|laundry detergent|skalbimo milteliai, kapsulės skalbimui",
      "minkštiklis|fabric softener", "šiukšlių maišai|bin bags|maišai šiukšlėms", "popieriniai rankšluosčiai|kitchen roll|rankšluosčiai",
      "servetėlės|napkins", "kempinės|sponges|kempinė", "folija|tin foil|aliuminio folija", "maistinė plėvelė|cling film|plėvelė",
      "kepimo popierius|baking paper", "valiklis|cleaner|universalus valiklis", "baterijos|batteries|elementai, AA", "degtukai|matches",
      "žvakės|candles", "dujų balionas|gas canister|dujos, butano", "šiukšlių maišeliai|small bin bags", "maišeliai užšaldymui|freezer bags|zip maišeliai",
    ],
  },
  {
    id: "gyvunams", nameLt: "Gyvūnams", nameEn: "Pets", emoji: "🐾", kind: "GROCERY",
    products: ["šunų maistas|dog food|ėdalas šunims", "kačių maistas|cat food|ėdalas katėms", "kraikas|cat litter"],
  },
  {
    id: "vaistine", nameLt: "Vaistinė", nameEn: "Pharmacy", emoji: "💊", kind: "GROCERY",
    products: [
      "pleistrai|plasters|pleistras, band-aid", "nuo skausmo|painkillers|ibuprofenas, paracetamolis", "vitaminai|vitamins",
      "repelentas|insect repellent|nuo uodų", "nosies purškalas|nasal spray",
    ],
  },
  { id: "kita", nameLt: "Kita", nameEn: "Other", emoji: "🛒", kind: "GROCERY", products: [] },
  {
    id: "kempingas", nameLt: "Kemperiui ir namams", nameEn: "Camper & home", emoji: "🏕️", kind: "LONGTERM",
    products: [
      "nešiojamas šildytuvas|portable heater|šildytuvas, heater", "dujų viryklė|camping stove|viryklė", "vandens bakelis|water container|kanistras",
      "pagalvė|pillow", "antklodė|duvet|antklodės", "rankšluosčiai vonios|bath towels", "prailgintuvas|extension cable|ilgintuvas",
      "žibintuvėlis|torch|flashlight, prožektorius", "kempingo kėdės|camping chairs|kėdės", "puodas|pot|puodai", "keptuvė|frying pan",
    ],
  },
  {
    id: "elektronika", nameLt: "Elektronika ir įrankiai", nameEn: "Electronics & tools", emoji: "🔌", kind: "LONGTERM",
    products: [
      "USB laidas|USB cable|įkroviklio laidas, kabelis", "įkroviklis|charger", "išorinė baterija|power bank|powerbank",
      "lemputė|light bulb|lemputės", "įrankiai|tools|atsuktuvas", "lipni juosta|tape|izoliacinė juosta",
    ],
  },
  {
    id: "drabuziai", nameLt: "Drabužiai ir avalynė", nameEn: "Clothes & shoes", emoji: "👕", kind: "LONGTERM",
    products: ["kojinės|socks", "batai|shoes|avalynė", "striukė|jacket", "maudymosi kostiumėlis|swimsuit|maudymukės", "kepurė|hat"],
  },
  { id: "ilgalaikiai", nameLt: "Kita, vėliau", nameEn: "Other, later", emoji: "📦", kind: "LONGTERM", products: [] },
];

export type SeedProduct = { seedKey: string; name: string; nameEn: string; aliases: string[]; categoryId: string; kind: "GROCERY" | "LONGTERM"; staple: boolean };

export function seedProducts(): SeedProduct[] {
  const out: SeedProduct[] = [];
  for (const c of SEED_CATEGORIES) {
    for (const line of c.products) {
      const [name, nameEn, aliases = "", star = ""] = line.split("|");
      out.push({
        seedKey: `${c.id}:${name}`,
        name,
        nameEn,
        aliases: aliases.split(",").map((a) => a.trim()).filter(Boolean),
        categoryId: c.id,
        kind: c.kind,
        staple: star === "*",
      });
    }
  }
  return out;
}
