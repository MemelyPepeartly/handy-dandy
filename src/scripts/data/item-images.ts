import type { ItemCategory } from "../schemas";

const FALLBACK_IMAGE = "systems/pf2e/icons/default-icons/equipment.svg" as const;

const ITEM_IMAGE_DEFAULTS: Record<ItemCategory, string> = {
  ammo: "systems/pf2e/icons/default-icons/ammo.svg",
  armor: "systems/pf2e/icons/default-icons/armor.svg",
  shield: "systems/pf2e/icons/default-icons/shield.svg",
  weapon: "systems/pf2e/icons/default-icons/weapon.svg",
  equipment: FALLBACK_IMAGE,
  backpack: "systems/pf2e/icons/default-icons/backpack.svg",
  book: "systems/pf2e/icons/default-icons/book.svg",
  consumable: "systems/pf2e/icons/default-icons/consumable.svg",
  treasure: "systems/pf2e/icons/default-icons/treasure.svg",
  feat: "systems/pf2e/icons/default-icons/feat.svg",
  spell: "systems/pf2e/icons/default-icons/spell.svg",
  wand: "systems/pf2e/icons/default-icons/consumable.svg",
  staff: "systems/pf2e/icons/default-icons/weapon.svg",
  other: FALLBACK_IMAGE,
} as const satisfies Record<ItemCategory, string>;

export function getDefaultItemImage(itemType: ItemCategory): string {
  return ITEM_IMAGE_DEFAULTS[itemType] ?? FALLBACK_IMAGE;
}

