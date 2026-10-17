# Sponsor rejection and refunds

Refunds stay manual. Nothing in the app calls the Stripe refund API.

## Review

Open `/admin/sponsor-cards` as an allowlisted admin with a recent second factor. The queue shows the pending card: name, description, logo, URL, task, and version. Approving or rejecting sends the version, update time, and content hash of the card you are looking at. If the buyer changed it, the action fails and you refresh. The public `/best` page renders only the frozen snapshot written at approval.

A card URL must be https. IP addresses, localhost, and internal host names are refused. Logos are PNG, JPEG, or WebP, at most 64 KB, with EXIF and other metadata removed. Text is normalized to NFKC. ZWJ and ZWNJ stay. Other invisible characters are removed, and the queue warns you when any were present.

## Reject reasons

A rejection needs a reason of 3 to 500 characters. The first rejection leaves the card `rejected` and opens one resubmission for 7 days. It does not refund the payment. The buyer uses the Checkout success page, with the same session id, to submit one new version. That version is pending and has to be approved again.

## Resubmission window

There is one resubmission, and only within 7 days of the first rejection. A second rejection sets the admin status to `refund_pending`. If the buyer does not resubmit within 7 days, the next review-queue load or resubmission attempt sets `refund_pending`. Either transition writes an audit row.

## Refunding in the Stripe dashboard

When the status is `refund_pending`, open the payment in the Stripe dashboard and refund it there. Do not expect the app to refund it. The test webhook is subscribed to `charge.refunded`, `refund.created`, and `refund.updated`. A succeeded refund, including a partial refund, sets `refunded_at` and hides the placement. A failed refund does not.

## Marking refunded

After the Stripe dashboard shows the refund, return to `/admin/sponsor-cards` and choose Mark refunded. That records your admin id, the time, and the note. It does not call Stripe. A second mark does nothing.

## Audit

Approve and reject rows live in `sponsorship_review_events` and include the content hash and version. `refund_pending` and `refunded` live in `sponsorship_refund_events`. Both tables reject updates, deletes, and `INSERT OR REPLACE`.
