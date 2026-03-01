import { CONSTANTS } from "../constants";

const REMIX_SUMMARY_TEMPLATE = `${CONSTANTS.TEMPLATE_PATH}/remix-summary-dialog.hbs`;

export interface RemixSummaryRow {
  label: string;
  before: string;
  after: string;
  note?: string;
}

interface ShowRemixSummaryDialogOptions {
  title: string;
  subtitle?: string;
  rows: RemixSummaryRow[];
  notes?: string[];
}

export async function showRemixSummaryDialog(options: ShowRemixSummaryDialogOptions): Promise<void> {
  const content = await renderTemplate(REMIX_SUMMARY_TEMPLATE, {
    subtitle: options.subtitle ?? "",
    rows: options.rows.map((row) => ({
      label: row.label,
      before: row.before || "—",
      after: row.after || "—",
      note: row.note || "—",
    })),
    notes: options.notes ?? [],
  });

  await new Promise<void>((resolve) => {
    const dialog = new Dialog(
      {
        title: options.title,
        content,
        buttons: {
          close: {
            icon: '<i class="fas fa-times"></i>',
            label: "Close",
            callback: () => resolve(),
          },
        },
        default: "close",
        close: () => resolve(),
      },
      { jQuery: true, width: 720 },
    );

    dialog.render(true);
  });
}

