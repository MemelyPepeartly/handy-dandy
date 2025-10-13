import type { ItemCategory } from "../schemas";

const FALLBACK_IMAGE = "systems/pf2e/icons/default-icons/equipment.svg" as const;

const ITEM_IMAGE_DEFAULTS: Record<ItemCategory, string> = {
  armor: "systems/pf2e/icons/default-icons/shield.svg",
  weapon: "systems/pf2e/icons/default-icons/weapon.svg",
  equipment: FALLBACK_IMAGE,
  consumable: "systems/pf2e/icons/default-icons/consumable.svg",
  feat: "systems/pf2e/icons/default-icons/feat.svg",
  spell: "systems/pf2e/icons/default-icons/spell.svg",
  wand: "systems/pf2e/icons/default-icons/wand.svg",
  staff: "systems/pf2e/icons/default-icons/staff.svg",
  other: FALLBACK_IMAGE,
} as const satisfies Record<ItemCategory, string>;

export function getDefaultItemImage(itemType: ItemCategory): string {
  return ITEM_IMAGE_DEFAULTS[itemType] ?? FALLBACK_IMAGE;
}

