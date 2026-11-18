import QRCode from "qrcode";
import type { Member } from "@/db/schema";
import { epcPayload } from "@/lib/epc";
import { formatEuro } from "@/lib/money";
import { recordPayment } from "@/app/actions";
import { CopyButton, SubmitButton } from "./ui";
import { Avatar } from "./Avatar";

/** "Pay X to Y" card: amount, Revolut link, SEPA QR, copy-IBAN, and the trust-based "I paid" button. */
export async function PayCard({
  from,
  to,
  amountCents,
  mealId,
  reference,
  viewerId,
}: {
  from: Member;
  to: Member;
  amountCents: number;
  mealId?: number;
  reference: string;
  viewerId: number;
}) {
  const iAmPayer = viewerId === from.id;
  const qr =
    iAmPayer && to.iban && to.ibanName
      ? await QRCode.toDataURL(epcPayload({ name: to.ibanName, iban: to.iban, amountCents, reference }), {
          errorCorrectionLevel: "M",
          margin: 1,
          width: 220,
        })
      : null;
  const amountPlain = (amountCents / 100).toFixed(2);

  return (
    <div className="card p-4">
      <div className="flex items-center gap-3">
        <Avatar name={iAmPayer ? to.name : from.name} size={36} />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted">{iAmPayer ? `Pay ${to.name}` : `${from.name} owes you`}</p>
          <p className="font-display text-2xl font-bold">{formatEuro(amountCents)}</p>
        </div>
        <CopyButton value={amountPlain} label="Copy €" />
      </div>

      {iAmPayer && (
        <div className="mt-3 space-y-2">
          {to.revolutHandle && (
            <a
              href={`https://revolut.me/${encodeURIComponent(to.revolutHandle)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn w-full bg-ink text-bg"
            >
              Open Revolut · @{to.revolutHandle}
            </a>
          )}
          {to.iban && (
            <details className="rounded-xl border border-line p-3">
              <summary className="cursor-pointer text-sm font-semibold">Bank transfer (IBAN / QR)</summary>
              <div className="mt-3 flex flex-col items-center gap-2">
                {qr && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qr} alt="SEPA payment QR" width={200} height={200} className="rounded-lg bg-white p-1" />
                )}
                <p className="text-center text-xs text-muted">
                  Scan in your banking app (SEPA QR) — amount and reference fill in automatically in most EU banks.
                </p>
                <div className="flex w-full items-center gap-2 rounded-lg bg-bg px-3 py-2">
                  <code className="min-w-0 flex-1 truncate text-xs">{to.iban}</code>
                  <CopyButton value={to.iban} label="Copy IBAN" />
                </div>
                {to.ibanName && <p className="text-xs text-muted">Holder: {to.ibanName}</p>}
              </div>
            </details>
          )}
          {!to.revolutHandle && !to.iban && (
            <p className="rounded-xl bg-warn-soft px-3 py-2 text-xs text-warn">
              {to.name} hasn&apos;t added Revolut or IBAN yet — pay cash or ask them.
            </p>
          )}
        </div>
      )}

      <form action={recordPayment} className="mt-3">
        <input type="hidden" name="fromId" value={from.id} />
        <input type="hidden" name="toId" value={to.id} />
        <input type="hidden" name="amountCents" value={amountCents} />
        {mealId && <input type="hidden" name="mealId" value={mealId} />}
        <SubmitButton className="btn-ok w-full" pendingText="Saving…">
          {iAmPayer ? `I paid ${formatEuro(amountCents)}` : `${from.name} paid me`}
        </SubmitButton>
      </form>
    </div>
  );
}
