import { useState } from "react";
import {
  OutlinedTextField,
  FilledButton,
} from "@skylabs-monorepo/shared-ui/react";

interface Props {
  onClose: () => void;
  onSave: (data: any) => void;
}

export function RefundForm({
  onClose,
  onSave,
}: Props) {
  const [form, setForm] = useState({
    payment_id: "",
    booking_id: "",
    customer_id: "",
    refund_amount: "",
    refund_reason: "",
    refund_method: "Original Payment Method",
    transaction_id: "",
    refund_status: "Pending",
    refunded_at: "",
    created_at: "",
  });

  /* ---------------------------------------------------------------------- */
  /*                              HANDLE CHANGE                             */
  /* ---------------------------------------------------------------------- */

  const handleChange = (
    key: string,
    value: any
  ) => {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  /* ---------------------------------------------------------------------- */
  /*                                SAVE                                    */
  /* ---------------------------------------------------------------------- */

  const handleSave = () => {
    onSave(form);
    onClose();
  };

  return (
    <div className="showcase-card">

      <h2>Add Refund</h2>

      <div className="form-grid">

        {/* ---------------------------------------------------------------- */}
        {/* Payment ID                                                       */}
        {/* ---------------------------------------------------------------- */}

        <OutlinedTextField
          label="Payment ID *"
          placeholder="Enter Payment ID"
          value={form.payment_id}
          onInput={(e: any) =>
            handleChange(
              "payment_id",
              e.target.value
            )
          }
        />

        {/* ---------------------------------------------------------------- */}
        {/* Booking ID                                                       */}
        {/* ---------------------------------------------------------------- */}

        <OutlinedTextField
          label="Booking ID *"
          placeholder="Enter Booking ID"
          value={form.booking_id}
          onInput={(e: any) =>
            handleChange(
              "booking_id",
              e.target.value
            )
          }
        />

        {/* ---------------------------------------------------------------- */}
        {/* Customer ID                                                      */}
        {/* ---------------------------------------------------------------- */}

        <OutlinedTextField
          label="Customer ID *"
          placeholder="Enter Customer ID"
          value={form.customer_id}
          onInput={(e: any) =>
            handleChange(
              "customer_id",
              e.target.value
            )
          }
        />

        {/* ---------------------------------------------------------------- */}
        {/* Refund Amount                                                    */}
        {/* ---------------------------------------------------------------- */}

        <OutlinedTextField
          label="Refund Amount *"
          placeholder="Enter Refund Amount"
          type="number"
          value={form.refund_amount}
          onInput={(e: any) =>
            handleChange(
              "refund_amount",
              e.target.value
            )
          }
        />

        {/* ---------------------------------------------------------------- */}
        {/* Refund Reason                                                    */}
        {/* ---------------------------------------------------------------- */}

        <OutlinedTextField
          label="Refund Reason *"
          type="textarea"
          rows={4}
          placeholder="Enter Refund Reason"
          value={form.refund_reason}
          onInput={(e: any) =>
            handleChange(
              "refund_reason",
              e.target.value
            )
          }
        />

        {/* ---------------------------------------------------------------- */}
        {/* Refund Method                                                    */}
        {/* ---------------------------------------------------------------- */}

        <OutlinedTextField
          label="Refund Method *"
          placeholder="Original Payment Method / Bank Transfer"
          value={form.refund_method}
          onInput={(e: any) =>
            handleChange(
              "refund_method",
              e.target.value
            )
          }
        />

        {/* ---------------------------------------------------------------- */}
        {/* Transaction ID                                                   */}
        {/* ---------------------------------------------------------------- */}

        <OutlinedTextField
          label="Transaction ID"
          placeholder="Enter Refund Transaction ID"
          value={form.transaction_id}
          onInput={(e: any) =>
            handleChange(
              "transaction_id",
              e.target.value
            )
          }
        />

        {/* ---------------------------------------------------------------- */}
        {/* Refund Status                                                    */}
        {/* ---------------------------------------------------------------- */}

        <OutlinedTextField
          label="Refund Status *"
          placeholder="Pending / Processed / Rejected"
          value={form.refund_status}
          onInput={(e: any) =>
            handleChange(
              "refund_status",
              e.target.value
            )
          }
        />

        {/* ---------------------------------------------------------------- */}
        {/* Refunded At                                                      */}
        {/* ---------------------------------------------------------------- */}

        <OutlinedTextField
          label="Refunded At"
          type="datetime-local"
          value={form.refunded_at}
          onInput={(e: any) =>
            handleChange(
              "refunded_at",
              e.target.value
            )
          }
        />

        {/* ---------------------------------------------------------------- */}
        {/* Created At                                                       */}
        {/* ---------------------------------------------------------------- */}

        <OutlinedTextField
          label="Created At *"
          type="datetime-local"
          value={form.created_at}
          onInput={(e: any) =>
            handleChange(
              "created_at",
              e.target.value
            )
          }
        />

      </div>

      {/* ------------------------------------------------------------------ */}
      {/* FORM ACTIONS                                                       */}
      {/* ------------------------------------------------------------------ */}

      <div className="form-actions">

        <FilledButton onClick={handleSave}>
          Save
        </FilledButton>

        <FilledButton onClick={onClose}>
          Cancel
        </FilledButton>

      </div>

    </div>
  );
}

export default RefundForm;

