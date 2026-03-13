import { CONSTANTS } from "../constants";
import { waitForDialog } from "../foundry/dialog";
import { renderApplicationTemplate } from "../foundry/templates";

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
  const content = await renderApplicationTemplate(REMIX_SUMMARY_TEMPLATE, {
    subtitle: options.subtitle ?? "",
    rows: options.rows.map((row) => ({
      label: row.label,
      before: row.before || "—",
      after: row.after || "—",
      note: row.note || "—",
    })),
    notes: options.notes ?? [],
  });

  await waitForDialog<void>({
    title: options.title,
    content,
    width: 720,
    buttons: [
      {
        action: "close",
        icon: '<i class="fas fa-times"></i>',
        label: "Close",
        default: true,
      },
    ],
  });
}

