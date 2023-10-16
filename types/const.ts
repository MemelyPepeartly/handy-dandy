const ATTRIBUTE_ABBREVIATIONS = new Set(["str", "dex", "con", "int", "wis", "cha"] as const);
const ALIGNMENTS = new Set(["LG", "NG", "CG", "LN", "N", "CN", "LE", "NE", "CE"] as const);
const ALLIANCES = new Set(["party", "opposition", null] as const);
const RARITIES = ["common", "uncommon", "rare", "unique"] as const;
const SIZES = ["tiny", "sm", "med", "lg", "huge", "grg"] as const;
const SENSE_TYPES = new Set([
    "darkvision",
    "echolocation",
    "greaterDarkvision",
    "heatsight",
    "lifesense",
    "lowLightVision",
    "motionsense",
    "scent",
    "seeInvisibility",
    "spiritsense",
    "thoughtsense",
    "tremorsense",
    "wavesense",
] as const);
const SENSE_ACUITIES = ["precise", "imprecise", "vague"] as const;
const SAVE_TYPES = ["fortitude", "reflex", "will"] as const;
const SKILL_ABBREVIATIONS = new Set([
    "acr",
    "arc",
    "ath",
    "cra",
    "dec",
    "dip",
    "itm",
    "med",
    "nat",
    "occ",
    "prf",
    "rel",
    "soc",
    "ste",
    "sur",
    "thi",
] as const);