import { CONSTANTS } from "../constants";
import { flattenSchema, listDocumentConstructors, getDocumentSchema } from "../helpers/utils";
import { runBatchGenerationFlow, runExportSelectionFlow } from "../flows/batch-ui";

/**
 * A lightweight window that lets the GM choose a Foundry document type
 * and inspect its data-model schema.
 */
export class SchemaTool extends Application {
  /** Default sizing & template */
  static override get defaultOptions(): ApplicationOptions {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "handy-dandy-schema-tool",
      title: "Document Schema Inspector",
      template: `${CONSTANTS.TEMPLATE_PATH}/schema-tool.hbs`,
      width: 600,
      height: 500,
      resizable: true,
    });
  }

  /** Track the currently-selected document */
  #selected: string = "Actor";

  /** Supply data to the Handlebars template */
  override getData(): any {
    const constructors = listDocumentConstructors();
    const schema = getDocumentSchema(this.#selected);
    return {
      docNames: Object.keys(constructors),
      selected: this.#selected,
      schemaFields: schema ? processSchema(schema) : []
    };
  }

  /** Wire up events after each render */
  override activateListeners(html: JQuery): void {
    super.activateListeners(html);

    // Handle dropdown changes
    html.find<HTMLSelectElement>("select[name='doc-type']").on("change", ev => {
      this.#selected = (ev.currentTarget as HTMLSelectElement).value;
      this.render(false);                       // re-render in place
    });

    // Simple copy-to-clipboard on row click
    html.find<HTMLElement>(".schema-row").on("click", ev => {
      const text = (ev.currentTarget as HTMLElement).dataset["path"] ?? "";
      navigator.clipboard.writeText(text);
      ui.notifications?.info(`Copied path ${text}`);
    });

    html.find<HTMLButtonElement>("button[data-action='export-selection']").on("click", () => {
      void runExportSelectionFlow();
    });

    html.find<HTMLButtonElement>("button[data-action='batch-generate']").on("click", () => {
      void runBatchGenerationFlow();
    });
  }
}

// Type guard for objects that look like Foundry schema fields
function isFieldObject(field: unknown): field is { [key: string]: any, constructor?: any, label?: string, initial?: any, default?: any, required?: any, fields?: any } {
  return typeof field === "object" && field !== null;
}

function processSchema(schema: any): any[] {
  if (!schema || typeof schema.fields !== "object") return [];
  return Object.entries(schema.fields).map(([key, field]) => {
    let type = typeof field;
    let detail = "";
    let isObject = false;
    let fields: any[] = [];

    if (isFieldObject(field)) {
      type = field.constructor?.name ?? typeof field;

      // Build a human-friendly detail string:
      if (typeof field.label === "string") {
        detail += `label: ${field.label}; `;
      }
      if ("initial" in field && field.initial !== undefined) {
        if (typeof field.initial === "function") {
          detail += "default: function; ";
        } else {
          detail += `default: ${String(field.initial)}; `;
        }
      }
      if ("default" in field && field.default !== undefined) {
        if (typeof field.default === "function") {
          detail += "default: function; ";
        } else {
          detail += `default: ${String(field.default)}; `;
        }
      }
      if ("required" in field && typeof field.required === "boolean") {
        detail += `required: ${field.required}; `;
      }

      if (typeof field.fields === "object" && field.fields !== null) {
        isObject = Object.keys(field.fields).length > 0;
        if (isObject) fields = processSchema(field);
      }
    } else {
      // fallback for primitives or weird cases
      detail = String(field);
    }

    return {
      key,        // the field name (like "name", "type", etc)
      type,       // the class, e.g. "StringField", "SchemaField"
      detail: detail.trim(), // remove trailing space
      isObject,   // does this field have sub-fields?
      fields      // the processed child fields (if any)
    };
  });
}

