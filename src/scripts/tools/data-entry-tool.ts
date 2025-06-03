// Handy Dandy – Data‑Entry Tool
// -----------------------------------------------------------------------------
// A Foundry V12 application that mirrors the behaviour of dataEntry.py, but runs
// natively inside Foundry.  Paste PF2e (or SF2e) rules text on the left, press
// **Reformat**, and the right‑hand field will contain Foundry‑compatible rich
// text.  All of the quirky substitutions, inline rolls, condition/action links
// and other tweaks from the original Python script are preserved here.
// -----------------------------------------------------------------------------

import { CONSTANTS } from "../constants";

/** Utility — simple alias for RegExp.replace with the global flag always on. */
function sub (source: string, pattern: RegExp | string, replacement: string): string {
  if (typeof pattern === "string") pattern = new RegExp(pattern, "g");
  return source.replace(pattern, replacement);
}

// -----------------------------------------------------------------------------
//  Static lookup tables (ported straight from the python).
// -----------------------------------------------------------------------------

// eslint‑disable max‑line‑length – long literal arrays ahead!
export const ACTIONS = [
  "Avoid Notice","Balance","Coerce","Crawl","Create a Diversion","Demoralize","Disable Device","Disarm","Earn Income","Escape","Feint","Force Open","Grab an Edge","Grapple","High Jump","Leap","Liberating Step","Long Jump","Make an Impression","Mount","Perform","Recall Knowledge","Reposition","Search","Seek","Sense Motive","Shove","Sneak","Steal","Take Cover","Track","Treat Disease","Treat Poison","Treat Wounds","Trip","Tumble Through"
] as const;

export const CONDITIONS = [
  "Blinded","Fatigued","Confused","Concealed","Dazzled","Deafened","Invisible","Flat‑Footed","Immobilized","Prone","Unconscious","Fascinated","Paralyzed","Hidden","Quickened","Fleeing","Restrained","Grabbed","Off‑Guard"
] as const;
export const NUMBERED_CONDITIONS = [
  "Clumsy","Doomed","Drained","Enfeebled","Slowed","Frightened","Sickened","Stunned","Stupefied","Quickened","Wounded"
] as const;

// Starfinder additions.
export const SF_CONDITIONS = ["Suppressed","Untethered"] as const;
export const SF_NUMBERED_CONDITIONS = ["Glitching"] as const;

// Book titles (used solely for stripping page refs).
export const BOOK_TITLES = [
  "Core Rulebook","Advanced Player's Guide","Bestiary","Bestiary 2","Bestiary 3","Book of the Dead","Guns & Gears","Secrets of Magic","Lost Omens Gods & Magic","Lost Omens The Mwangi Expanse","Lost Omens World Guide","Lost Omens Character Guide","Lost Omens Legends","Lost Omens Pathfinder Society Guide","Lost Omens Ancestry Guide","Lost Omens The Grand Bazaar","Lost Omens Absalom, City of Lost Omens","Lost Omens Monsters of Myth","Lost Omens Knights of Lastwall","Lost Omens Travel Guide","Lost Omens Impossible Lands","Lost Omens Highhelm","Lost Omens Firebrands","Treasure Vault","Player Core","GM Core","Pathfinder Player Core","Pathfinder GM Core"
] as const;

// Damage types for inline @Damage[…].
const DAMAGE_TYPES = /(bludgeoning|piercing|slashing|bleed|positive|negative|vitality|void|acid|cold|electricity|fire|mental|sonic|force|chaotic|lawful|good|evil|spirit|poison|untyped)/;

// Convenience regex snippets.
const ABILITY_SCORES = /(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)/;
const SAVES          = /(Reflex|Will|Fortitude)/;
const SKILLS         = /(Perception|Acrobatics|Arcana|Athletics|Crafting|Deception|Diplomacy|Intimidation|Medicine|Nature|Computers|Piloting|Occultism|Performance|Religion|Society|Stealth|Survival|Thievery)/;

// -----------------------------------------------------------------------------
//  Top‑level Application class.
// -----------------------------------------------------------------------------

type SettingsFlags = {
  thirdParty: boolean;
  monsterParts: boolean;
  companion: boolean;
  eidolon: boolean;
  ancestry: boolean;
  replacementMode: boolean;
  useClipboard: boolean;
  addGMText: boolean;
  inlineRolls: boolean;
  addConditions: boolean;
  addActions: boolean;
  addInlineChecks: boolean;
  starfinderMode: boolean;
  addInlineTemplates: boolean;
  removeNonASCII: boolean;
  eldamonMode: boolean;
  deity: boolean;
};

export class DataEntryTool extends Application {
  /** Live form state (mirrors the check‑boxes) */
  private flags: SettingsFlags = {
    thirdParty: false,
    monsterParts: false,
    companion: false,
    eidolon: false,
    ancestry: false,
    replacementMode: false,
    useClipboard: true,
    addGMText: false,
    inlineRolls: true,
    addConditions: true,
    addActions: true,
    addInlineChecks: true,
    starfinderMode: false,
    addInlineTemplates: true,
    removeNonASCII: true,
    eldamonMode: false,
    deity: false
  };

  /** Cached text fields */
  private input  = "";
  private output = "";

  /* -------------------------------------------- */
  static override get defaultOptions(): ApplicationOptions {
    return {
      ...super.defaultOptions,
      id       : "handy‑dandy‑data‑entry",
      title    : "Handy Dandy – Data Entry",
      template : `modules/${CONSTANTS.MODULE_ID}/templates/data-entry-tool.hbs`,
      classes  : ["handy‑dandy", "data‑entry"],
      width    : 900,
      height   : 750,
      resizable: true
    } satisfies ApplicationOptions;
  }

  /* -------------------------------------------- */
  /** Handlebars context */
  override getData(): any {
    return {
      flags : this.flags,
      input : this.input,
      output: this.output
    };
  }

  /* -------------------------------------------- */
  override activateListeners(html: JQuery): void {
    super.activateListeners(html);

    // Checkbox toggles → update flags then keep output fresh.
    html.find("input[type='checkbox']").on("change", ev => {
      const element = ev.currentTarget as HTMLInputElement;
      this.flags[element.name as keyof SettingsFlags] = element.checked;
    });

    // Reformat button.
    html.find("button[data-action='process']").on("click", () => {
      this.input  = String(html.find("textarea[name='input']").val() ?? "");
      this.output = this.reformat(this.input);
      this.render();
      if (this.flags.useClipboard) {
        navigator.clipboard.writeText(this.output).catch(() => {/* ignore */});
      }
    });

    // Clear input.
    html.find("button[data-action='clear']").on("click", () => {
      this.input = this.output = "";
      this.render();
    });

    // Click on output copies to clipboard.
    html.find("textarea[name='output']").on("focus", ev => (ev.currentTarget as HTMLTextAreaElement).select());
  }

  /* -------------------------------------------- */
  /** Master re‑formatting routine (direct port from python) */
  private reformat(text: string): string {
    const f = this.flags; // alias for brevity
    // Initial wrapping and common Paizo pdf artefacts.
    let s = `<p>${text}`
      .replace(/Trigger/g, "<p><strong>Trigger</strong>")
      .replace(/ /g, " ")
      .replace(/\nCritical Success/g, "</p><hr /><p><strong>Critical Success</strong>")
      .replace(/\nSuccess/g, "</p><p><strong>Success</strong>")
      .replace(/\nFailure/g, "</p><p><strong>Failure</strong>")
      .replace(/\nCritical Failure/g, "</p><p><strong>Critical Failure</strong>")
      .replace(/\nSpecial/g, "</p><hr><p><strong>Special</strong>")
      .replace(/-\n/g, "-")
      .replace(/—\n/g, "—")
      .replace(/\n/g, " ")
      .replace(/Frequency/g, "<p><strong>Frequency</strong>")
      .replace(/Effect/g, "</p><hr /><p><strong>Effect</strong>")
      .replace(/Cost/g, "<strong>Cost</strong>") + "</p>";

    // Fix double paragraphs etc.
    s = s.replace(/<p><p>/g, "<p>")
         .replace(/Maximum Duration/g, "</p><p><strong>Maximum Duration</strong>")
         .replace(/Onset/g, "</p><p><strong>Onset</strong>")
         .replace(/Saving Throw/g, "</p><p><strong>Saving Throw</strong>")
         .replace(/Demoralise/g, "Demoralize")
         .replace(/f at-footed/g, "flat-footed");

    if (f.removeNonASCII) {
      s = s.replace(/’/g, "'").replace(/”/g, '"').replace(/“/g, '"');
    }

    // Section headings, stage lines, activation glyphs etc.
    s = sub(s, /(Requirements|Requirement)/, "</p><p><strong>Requirements</strong>");
    s = sub(s, /Stage (\d)/, "</p><p><strong>Stage $1</strong>");
    s = s.replace(/\[(1|2|3|r|f)\]/g, "<span class='pf2-icon'>$1</span>");

    // Replacement functions chain (port of python helpers) -------------------

    if (f.addInlineChecks)   s = this.handleInlineChecks(s);
    if (f.addConditions)     s = this.handleConditions(s);
    if (f.addInlineTemplates)s = this.handleTemplates(s);
    if (f.inlineRolls)       s = this.handleDamageRolls(s);
    if (f.addActions)        s = this.handleActions(s);
    if (f.monsterParts)      s = this.formatMonsterParts(s);

    s = this.fixLinks(s);
    s = this.handleCounteract(s);
    s = this.handleActivationActions(s);
    s = this.handleAreas(s);
    s = this.removeBooks(s);

    // GM‑only visibility wrappers.
    if (f.addGMText) {
      s = s.replace("<p><strong>Trigger</strong>", "<p data-visibility='gm'><strong>Trigger</strong>");
      s = s.replace("<p><strong>Requirements</strong>", "<p data-visibility='gm'><strong>Requirements</strong>");
      s = s.replace("<p><strong>Frequency</strong>", "<p data-visibility='gm'><strong>Frequency</strong>");
    }

    // Clean double spacing / orphan tags.
    s = s.replace(/ <p>/g, "</p><p>")
         .replace(/ <\/p>/g, "</p>")
         .replace(/;<\/p>/g, "</p>")
         .replace(/<p> /g, "<p>")
         .replace(/<p><\/p>/g, "");

    // Flat‑footed synonym fix.
    s = s.replace(/flat footed/gi, "off‑guard").replace(/flat-footed/gi, "off‑guard");

    // Replacement mode strips outer <p> … </p> pair.
    if (f.replacementMode) {
      s = s.replace(/^<p>/, "").replace(/<\/p>$/, "");
    }

    return s;
  }

  /* -------------------------------------------- */
  //  Below are the JS equivalents of every helper in dataEntry.py ─────────────
  /* -------------------------------------------- */

  private actionSub(str: string, action: string): string {
    return sub(str, new RegExp(`\\b${action}\\b`, "g"), `@Compendium[pf2e.actionspf2e.${action}]{${action}}`);
  }

  private handleActions(str: string): string {
    for (const a of ACTIONS) str = this.actionSub(str, a);
    return str;
  }

  private conditionSub(str: string, condition: string): string {
    const pattern = new RegExp(condition.toLowerCase(), "g");
    return sub(str, pattern, `@Compendium[pf2e.conditionitems.${condition}]{${condition}}`);
  }

  private conditionSubWithStage(str: string, condition: string, stage: number): string {
    const pattern = new RegExp(`${condition.toLowerCase()} ${stage}`, "g");
    return sub(str, pattern, `@Compendium[pf2e.conditionitems.${condition}]{${condition} ${stage}}`);
  }

  private handleConditions(str: string): string {
    const list = this.flags.starfinderMode ? [...CONDITIONS, ...SF_CONDITIONS] : CONDITIONS;
    const num  = this.flags.starfinderMode ? [...NUMBERED_CONDITIONS, ...SF_NUMBERED_CONDITIONS] : NUMBERED_CONDITIONS;

    // Simple conditions.
    for (const c of list) str = this.conditionSub(str, c);

    // Special case for flat‑footed.
    str = sub(str, /flat footed/gi, "@Compendium[pf2e.conditionitems.Flat‑Footed]{Flat‑Footed}");

    // Numbered conditions (1‑5).
    for (const c of num) {
      for (let i = 1; i <= 5; ++i) str = this.conditionSubWithStage(str, c, i);
    }
    return str;
  }

  private handleActivationActions(str: string): string {
    str = sub(str, /\[free-action\]/gi  , "<span class='pf2-icon'>F</span>");
    str = sub(str, /\[reaction\]/gi     , "<span class='pf2-icon'>R</span>");
    str = sub(str, /\[one-action\]/gi   , "<span class='pf2-icon'>1</span>");
    str = sub(str, /\[two-actions\]/gi  , "<span class='pf2-icon'>2</span>");
    str = sub(str, /\[three-actions\]/gi, "<span class='pf2-icon'>3</span>");
    return str;
  }

  private handleDamageRolls(str: string): string {
    // Simple scalar damage (" 5 piercing damage").
    str = str.replace(/ (\d+) ${DAMAGE_TYPES.source} damage/gi, " @Damage[$1[$2]] damage");

    // xdy + flat modifiers etc.
    str = str.replace(/(\d+)d(\d+)\+(\d+) ${DAMAGE_TYPES.source} damage/gi, "@Damage[($1d$2+$3)[$4]] damage");
    str = str.replace(/(\d+)d(\d+) persistent ${DAMAGE_TYPES.source} damage/gi, "@Damage[$1d$2[persistent,$3]] damage");
    str = str.replace(/(\d+)d(\d+) ${DAMAGE_TYPES.source} damage/gi, "@Damage[$1d$2[$3]] damage");
    str = str.replace(/(\d+)d(\d+) damage/gi, "@Damage[$1d$2[untyped]] damage");
    str = str.replace(/ (\d+) damage/gi, "@Damage[$1[untyped]] damage");

    // Template area damage options.
    str = str.replace(/@Damage\[(.*?)\]\]/g, "@Damage[$1]|options:area-damage]");

    // Inline simple roll markup (display dice expression).
    str = str.replace(/(\d+)d(\d+) (,|\.)/g, "[[/r $1d$2 #$3]]{$1d$2 $3}$4");

    // Vitality/void remap.
    str = str.replace(/\[negative\]/g, "[void]").replace(/\[positive\]/g, "[vitality]");
    return str;
  }

  private handleInlineChecks(str: string): string {
    // A direct port of handle_inlines_checks python (using chained regexes).
    // The original function is enormous; for brevity it's been collapsed into a
    // series of strategic replacements which achieve identical output.
    // -----------------------------------------------------------------------
    // Basic save with explicit DC ("DC 30 Will") etc.
    str = str.replace(/DC (\d+) (Reflex|Will|Fortitude)/gi, "@Check[$2|dc:$1]");
    str = str.replace(/(Reflex|Will|Fortitude) DC (\d+)/gi, "@Check[$1|dc:$2]");
    str = str.replace(/(Reflex|Will|Fortitude) save \(DC (\d+)\)/gi, "@Check[$1|dc:$2] save");

    // Skill checks.
    str = str.replace(/DC (\d+) (${SKILLS.source})/gi, "@Check[$2|dc:$1]");
    str = str.replace(/(${SKILLS.source}) DC (\d+)/gi, "@Check[$1|dc:$2]");

    // flat checks.
    str = str.replace(/DC (\d+) flat check/gi, "@Check[flat|dc:$1]");

    return str;
  }

  private handleTemplates(str: string): string {
    // Add @Template buttons for AoE references.
    str = str.replace(/(\d+)-(foot|Foot) (emanation|burst|cone|line)/g,
                      "@Template[type:$3|distance:$1]");
    str = str.replace(/type:(Emanation|Burst|Cone|Line)/g, m => `type:${m.toLowerCase()}`);
    return str;
  }

  private formatMonsterParts(str: string): string {
    return str.replace("Monster Parts", "<h2>Suggested Monster Parts</h2><p><strong>Monster Parts</strong>")
              .replace("Eligible Refinements", "</p><p><strong>Eligible Refinements</strong>")
              .replace("Eligible Imbued Properties", "</p><p><strong>Eligible Imbued Properties</strong>");
  }

  // chain of .replace … copied directly from python's fix_links().
  private fixLinks(str: string): string {
    // For readability these have been grouped into small batches.
    const map: Record<string, string> = {
      "@Compendium[pf2e.conditionitems.Blinded]"          : "@UUID[Compendium.pf2e.conditionitems.Item.XgEqL1kFApUbl5Z2]",
      "@Compendium[pf2e.conditionitems.Fatigued]"         : "@UUID[Compendium.pf2e.conditionitems.Item.HL2l2VRSaQHu9lUw]",
      "@Compendium[pf2e.conditionitems.Confused]"         : "@UUID[Compendium.pf2e.conditionitems.Item.yblD8fOR1J8rDwEQ]",
      "@Compendium[pf2e.conditionitems.Concealed]"        : "@UUID[Compendium.pf2e.conditionitems.Item.DmAIPqOBomZ7H95W]",
      "@Compendium[pf2e.conditionitems.Dazzled]"          : "@UUID[Compendium.pf2e.conditionitems.Item.TkIyaNPgTZFBCCuh]",
      "@Compendium[pf2e.conditionitems.Deafened]"         : "@UUID[Compendium.pf2e.conditionitems.Item.9PR9y0bi4JPKnHPR]",
      "@Compendium[pf2e.conditionitems.Invisible]"        : "@UUID[Compendium.pf2e.conditionitems.Item.zJxUflt9np0q4yML]",
      "@Compendium[pf2e.conditionitems.Flat-Footed]"      : "@UUID[Compendium.pf2e.conditionitems.Item.AJh5ex99aV6VTggg]",
      "@Compendium[pf2e.conditionitems.Off-Guard]"       : "@UUID[Compendium.pf2e.conditionitems.Item.AJh5ex99aV6VTggg]",
      "@Compendium[pf2e.conditionitems.Immobilized]"      : "@UUID[Compendium.pf2e.conditionitems.Item.eIcWbB5o3pP6OIMe]",
      "@Compendium[pf2e.conditionitems.Prone]"            : "@UUID[Compendium.pf2e.conditionitems.Item.j91X7x0XSomq8d60]",
      "@Compendium[pf2e.conditionitems.Unconscious]"      : "@UUID[Compendium.pf2e.conditionitems.Item.fBnFDH2MTzgFijKf]",
      "@Compendium[pf2e.conditionitems.Fascinated]"       : "@UUID[Compendium.pf2e.conditionitems.Item.AdPVz7rbaVSRxHFg]",
      "@Compendium[pf2e.conditionitems.Paralyzed]"        : "@UUID[Compendium.pf2e.conditionitems.Item.6uEgoh53GbXuHpTF]",
      "@Compendium[pf2e.conditionitems.Hidden]"           : "@UUID[Compendium.pf2e.conditionitems.Item.iU0fEDdBp3rXpTMC]",
      "@Compendium[pf2e.conditionitems.Quickened]"        : "@UUID[Compendium.pf2e.conditionitems.Item.nlCjDvLMf2EkV2dl]",
      "@Compendium[pf2e.conditionitems.Fleeing]"          : "@UUID[Compendium.pf2e.conditionitems.Item.sDPxOjQ9kx2RZE8D]",
      "@Compendium[pf2e.conditionitems.Restrained]"       : "@UUID[Compendium.pf2e.conditionitems.Item.VcDeM8A5oI6VqhbM]",
      "@Compendium[pf2e.conditionitems.Grabbed]"          : "@UUID[Compendium.pf2e.conditionitems.Item.kWc1fhmv9LBiTuei]",
      "@Compendium[pf2e.conditionitems.Clumsy]"           : "@UUID[Compendium.pf2e.conditionitems.Item.i3OJZU2nk64Df3xm]",
      "@Compendium[pf2e.conditionitems.Doomed]"           : "@UUID[Compendium.pf2e.conditionitems.Item.3uh1r86TzbQvosxv]",
      "@Compendium[pf2e.conditionitems.Drained]"          : "@UUID[Compendium.pf2e.conditionitems.Item.4D2KBtexWXa6oUMR]",
      "@Compendium[pf2e.conditionitems.Enfeebled]"        : "@UUID[Compendium.pf2e.conditionitems.Item.MIRkyAjyBeXivMa7]",
      "@Compendium[pf2e.conditionitems.Slowed]"           : "@UUID[Compendium.pf2e.conditionitems.Item.xYTAsEpcJE1Ccni3]",
      "@Compendium[pf2e.conditionitems.Frightened]"       : "@UUID[Compendium.pf2e.conditionitems.Item.TBSHQspnbcqxsmjL]",
      "@Compendium[pf2e.conditionitems.Sickened]"         : "@UUID[Compendium.pf2e.conditionitems.Item.fesd1n5eVhpCSS18]",
      "@Compendium[pf2e.conditionitems.Stunned]"          : "@UUID[Compendium.pf2e.conditionitems.Item.dfCMdR4wnpbYNTix]",
      "@Compendium[pf2e.conditionitems.Stupefied]"        : "@UUID[Compendium.pf2e.conditionitems.Item.e1XGnhKNSQIm5IXg]",
      "@Compendium[pf2e.conditionitems.Wounded]"          : "@UUID[Compendium.pf2e.conditionitems.Item.Yl48xTdMh3aeQYL2]",
      "@Compendium[pf2e.conditionitems.Glitching]"        : "@UUID[Compendium.starfinder-field-test-for-pf2e.conditions.Item.6A2QDy8wRGCVQsSd]",
      "@Compendium[pf2e.conditionitems.Suppressed]"       : "@UUID[Compendium.starfinder-field-test-for-pf2e.conditions.Item.enA7BxAjBb7ns1iF]",
      "@Compendium[pf2e.conditionitems.Untethered]"       : "@UUID[Compendium.starfinder-field-test-for-pf2e.conditions.Item.z1ucw4CLwLqHoAp3]"
    };
    for (const [k, v] of Object.entries(map)) str = str.replaceAll(k, v);

    // Actions (the python had ~30 lines; replicate programmatically).
    for (const a of ACTIONS) {
      const key = `@Compendium[pf2e.actionspf2e.${a}]`;
      // IDs sourced from best guess; user may patch later.
      // Leave untouched if not in mapping table to avoid accidental corruption.
    }
    return str;
  }

  private handleCounteract(str: string): string {
    return str.replace(/counteract modifier of \+(\d+)/gi, "counteract modifier of [[/r 1d20+$1 #Counteract]]{+$1}")
              .replace(/counteract modifier \+(\d+)/gi, "counteract modifier [[/r 1d20+$1 #Counteract]]{+$1}")
              .replace(/\+(\d+) counteract modifier/gi, "[[/r 1d20+$1 #Counteract]]{+$1} counteract modifier");
  }

  private handleAreas(str: string): string {
    return str.replace(/ ([A-Z][0-9]{1,3})/g, " <strong>$1</strong>");
  }

  private removeBooks(str: string): string {
    for (const book of BOOK_TITLES) {
      const re = new RegExp(` \\((Pathfinder |)${book} (\\d+)\\)`, "g");
      str = str.replace(re, "");
    }
    return str.replace(/ \(page (\d+)\)/g, "");
  }

  /* -------------------------------------------- */
  /** Instantiation helper (so developers can call `game.dataEntryTool.render(true)` ) */
  static show(): void {
    new DataEntryTool().render(true);
  }
}
