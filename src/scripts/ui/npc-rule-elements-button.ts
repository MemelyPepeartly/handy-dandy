import { CONSTANTS } from "../constants";

const BUTTON_CLASS = "handy-dandy-npc-rule-elements-button" as const;
const BUTTON_ICON_CLASS = "fas fa-code" as const;
const BUTTON_LABEL = "Rules" as const;
const BUTTON_TITLE = "Edit Handy Dandy NPC rule elements" as const;
const RULE_ELEMENT_EDITOR_TEMPLATE = `${CONSTANTS.TEMPLATE_PATH}/npc-rule-elements-editor.hbs`;

const RULE_CONTAINER_FLAG = "npcRuleElementContainer" as const;
const RULE_CONTAINER_NAME = "Handy Dandy: NPC Rule Elements" as const;
const RULE_CONTAINER_SLUG = "handy-dandy-npc-rule-elements" as const;
const GLOBAL_RULE_TARGET_KEY = "__handy_dandy_npc_global_rules__" as const;

type RuleElementData = Record<string, unknown>;
type RuleElementTarget = {
  key: string;
  label: string;
  rules: RuleElementData[];
};
type RuleElementDialogResult = {
  targetKey: string;
  rules: RuleElementData[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function extractRulesFromUnknown(value: unknown): RuleElementData[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is RuleElementData => {
    if (!isRecord(entry)) {
      return false;
    }

    const key = entry.key;
    return typeof key === "string" && key.trim().length > 0;
  });
}

function resolveRulesCandidate(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value;
  }

  if (!isRecord(value)) {
    return null;
  }

  if (typeof value.key === "string" && value.key.trim().length > 0) {
    return [value];
  }

  if (Array.isArray(value.rules)) {
    return value.rules;
  }

  const system = value.system;
  if (isRecord(system) && Array.isArray(system.rules)) {
    return system.rules;
  }

  const result = value.result;
  if (isRecord(result) && Array.isArray(result.rules)) {
    return result.rules;
  }

  const data = value.data;
  if (isRecord(data) && Array.isArray(data.rules)) {
    return data.rules;
  }

  return null;
}

export function parseRuleElementsInput(raw: string): RuleElementData[] {
  const trimmed = raw.trim();
  if (!trimmed) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch {
    throw new Error("Rule elements must be valid JSON.");
  }

  const candidate = resolveRulesCandidate(parsed);

  if (!Array.isArray(candidate)) {
    throw new Error(
      "Provide a rule element object, a rules array, or an object containing rules (e.g. { rules }, { system: { rules } }).",
    );
  }

  const normalized = extractRulesFromUnknown(candidate);
  if (normalized.length !== candidate.length) {
    throw new Error("Each rule element entry must be an object with a non-empty string key.");
  }

  return normalized;
}

function extractRuleElementsFromItem(item: Item): RuleElementData[] {
  const source = item.toObject() as { system?: { rules?: unknown } };
  return extractRulesFromUnknown(source.system?.rules);
}

function findRuleContainer(actor: Actor): Item | null {
  const items = Array.from(actor.items.values()) as Item[];

  const byFlag = items.find((item) => {
    if (String(item.type) !== "effect") {
      return false;
    }
    return item.getFlag(CONSTANTS.MODULE_ID as never, RULE_CONTAINER_FLAG as never) === true;
  });
  if (byFlag instanceof Item) {
    return byFlag;
  }

  const bySlug = items.find((item) => {
    if (String(item.type) !== "effect") {
      return false;
    }

    const system = item.system as { slug?: unknown } | undefined;
    if (typeof system?.slug === "string" && system.slug === RULE_CONTAINER_SLUG) {
      return true;
    }

    return item.name.trim() === RULE_CONTAINER_NAME;
  });

  return bySlug instanceof Item ? bySlug : null;
}

async function ensureRuleContainer(actor: Actor): Promise<Item> {
  const existing = findRuleContainer(actor);
  if (existing) {
    const flagged = existing.getFlag(CONSTANTS.MODULE_ID as never, RULE_CONTAINER_FLAG as never) === true;
    if (!flagged) {
      await existing.setFlag(CONSTANTS.MODULE_ID as never, RULE_CONTAINER_FLAG as never, true as never);
    }
    return existing;
  }

  const source = {
    name: RULE_CONTAINER_NAME,
    type: "effect",
    img: "systems/pf2e/icons/default-icons/effect.svg",
    system: {
      slug: RULE_CONTAINER_SLUG,
      description: {
        value: "<p>Stores custom PF2E rule elements managed from Handy Dandy.</p>",
      },
      duration: {
        value: -1,
        unit: "unlimited",
        sustained: false,
        expiry: null,
      },
      tokenIcon: {
        show: false,
      },
      rules: [],
    },
    flags: {
      [CONSTANTS.MODULE_ID]: {
        [RULE_CONTAINER_FLAG]: true,
      },
    },
  };

  const created = await actor.createEmbeddedDocuments(
    "Item",
    [source as unknown as Record<string, unknown>],
  ) as unknown as Item[];
  const [item] = created;
  if (!(item instanceof Item)) {
    throw new Error("Failed to create NPC rule container item.");
  }

  return item;
}

function buildRuleElementTargets(actor: Actor): RuleElementTarget[] {
  const container = findRuleContainer(actor);
  const containerRules = container ? extractRuleElementsFromItem(container) : [];

  const targets: RuleElementTarget[] = [
    {
      key: GLOBAL_RULE_TARGET_KEY,
      label: "NPC-wide (Handy Dandy hidden effect)",
      rules: containerRules,
    },
  ];

  const containerId = container?.id ?? null;
  const actorItems = Array.from(actor.items.values()) as Item[];
  actorItems
    .filter((item) => {
      const id = item.id;
      if (typeof id !== "string" || id.length === 0) {
        return false;
      }

      return id !== containerId;
    })
    .sort((left, right) => {
      const leftLabel = `${left.type}:${left.name}`.toLocaleLowerCase();
      const rightLabel = `${right.type}:${right.name}`.toLocaleLowerCase();
      return leftLabel.localeCompare(rightLabel);
    })
    .forEach((item) => {
      targets.push({
        key: item.id as string,
        label: `${item.name} [${item.type}]`,
        rules: extractRuleElementsFromItem(item),
      });
    });

  return targets;
}

async function promptRuleElements(
  actor: Actor,
  targets: RuleElementTarget[],
): Promise<RuleElementDialogResult | null> {
  const defaultTarget = targets[0];
  if (!defaultTarget) {
    return null;
  }

  const rulesByTarget = new Map<string, string>(
    targets.map((target) => [target.key, JSON.stringify(target.rules, null, 2)]),
  );

  const content = await renderTemplate(RULE_ELEMENT_EDITOR_TEMPLATE, {
    actorName: actor.name,
    targetOptions: targets.map((target) => ({
      key: target.key,
      label: target.label,
      selected: target.key === defaultTarget.key,
    })),
    rulesJson: rulesByTarget.get(defaultTarget.key) ?? "[]",
  });

  return await new Promise<RuleElementDialogResult | null>((resolve) => {
    let settled = false;
    const finish = (value: RuleElementDialogResult | null): void => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };

    const dialog = new Dialog(
      {
        title: `${CONSTANTS.MODULE_NAME} | NPC Rule Elements`,
        content,
        buttons: {
          save: {
            icon: '<i class="fas fa-save"></i>',
            label: "Save",
            callback: (html) => {
              const targetSelect = html[0]?.querySelector<HTMLSelectElement>("select[name='targetKey']");
              const textarea = html[0]?.querySelector<HTMLTextAreaElement>("textarea[name='rulesJson']");
              const targetKey = targetSelect?.value?.trim() ?? "";
              if (!targetKey || !targets.some((target) => target.key === targetKey)) {
                ui.notifications?.error(`${CONSTANTS.MODULE_NAME} | Select a valid rule target.`);
                return false;
              }

              const raw = textarea?.value ?? "";
              try {
                const parsed = parseRuleElementsInput(raw);
                finish({
                  targetKey,
                  rules: parsed,
                });
              } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                ui.notifications?.error(`${CONSTANTS.MODULE_NAME} | ${message}`);
                return false;
              }
            },
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: "Cancel",
            callback: () => finish(null),
          },
        },
        default: "save",
        close: () => finish(null),
      },
      { jQuery: true, width: 760 },
    );

    const hookId = Hooks.on("renderDialog", (app: Dialog, html: JQuery<HTMLElement>) => {
      if (app !== dialog) {
        return;
      }

      Hooks.off("renderDialog", hookId);

      const root = html[0];
      const targetSelect = root?.querySelector<HTMLSelectElement>("select[name='targetKey']");
      const textarea = root?.querySelector<HTMLTextAreaElement>("textarea[name='rulesJson']");
      if (!(targetSelect instanceof HTMLSelectElement) || !(textarea instanceof HTMLTextAreaElement)) {
        return;
      }

      const draftByTarget = new Map<string, string>(rulesByTarget);

      textarea.addEventListener("input", () => {
        const selectedKey = targetSelect.value;
        draftByTarget.set(selectedKey, textarea.value);
      });

      targetSelect.addEventListener("change", () => {
        const nextValue = draftByTarget.get(targetSelect.value) ?? "[]";
        textarea.value = nextValue;
      });
    });

    dialog.render(true);
  });
}

async function resolveRuleElementTargetItem(actor: Actor, targetKey: string): Promise<Item> {
  if (targetKey === GLOBAL_RULE_TARGET_KEY) {
    return await ensureRuleContainer(actor);
  }

  const item = actor.items.get(targetKey);
  if (!(item instanceof Item)) {
    throw new Error("Selected target item no longer exists.");
  }

  return item;
}

export function registerNpcRuleElementsButton(): void {
  Hooks.on("renderActorSheetPF2e", (app: ActorSheet, html: JQuery<HTMLElement>) => {
    const actor = app.actor;
    if (!(actor instanceof Actor)) {
      return;
    }

    if (String(actor.type) !== "npc") {
      return;
    }

    const user = game.user;
    if (!user) {
      return;
    }
    if (!user.isGM && !app.document?.isOwner) {
      return;
    }

    const windowHeader = html.find(".window-header").first();
    if (windowHeader.length === 0) {
      return;
    }
    if (windowHeader.find(`.${BUTTON_CLASS}`).length > 0) {
      return;
    }

    const button = $(
      `<a class="${BUTTON_CLASS}" title="${BUTTON_TITLE}">
        <i class="${BUTTON_ICON_CLASS}"></i>
        <span>${BUTTON_LABEL}</span>
      </a>`,
    );

    button.on("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      void (async () => {
        try {
          const targets = buildRuleElementTargets(actor);
          const result = await promptRuleElements(actor, targets);
          if (!result) {
            return;
          }

          const targetItem = await resolveRuleElementTargetItem(actor, result.targetKey);
          await targetItem.update({
            "system.rules": result.rules,
          } as Record<string, unknown>);

          const count = result.rules.length;
          ui.notifications?.info(
            `${CONSTANTS.MODULE_NAME} | Saved ${count} rule element${count === 1 ? "" : "s"} on ${targetItem.name}.`,
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          ui.notifications?.error(`${CONSTANTS.MODULE_NAME} | Failed to save NPC rule elements: ${message}`);
          console.error(`${CONSTANTS.MODULE_NAME} | Failed to save NPC rule elements`, error);
        }
      })();
    });

    const closeButton = windowHeader.find(".close").first();
    if (closeButton.length > 0) {
      closeButton.before(button);
    } else {
      windowHeader.append(button);
    }
  });
}
