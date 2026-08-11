import { useState } from "react";
import {
  OutlinedTextField,
  FilledButton,
} from "@skylabs-monorepo/shared-ui/react";

interface Props {
  onClose: () => void;
  onSave: (data: any) => void;
}

export function OrdersForm({
  onClose,
  onSave,
}: Props) {
  const [form, setForm] = useState({
    customer_id: "",
    vendor_id: "",
    service_id: "",
    booking_date: "",
    booking_time: "",
    amount: "",
    discount: "",
    final_amount: "",
    booking_status: "Pending",
    payment_status: "Pending",
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
  /*                           CALCULATE FINAL AMOUNT                       */
  /* ---------------------------------------------------------------------- */

  const handleAmountChange = (value: string) => {
    const amount = Number(value) || 0;
    const discount = Number(form.discount) || 0;

    const finalAmount = Math.max(
      amount - discount,
      0
    );

    setForm((prev) => ({
      ...prev,
      amount: value,
      final_amount:
        value === "" ? "" : String(finalAmount),
    }));
  };

  /* ---------------------------------------------------------------------- */
  /*                          DISCOUNT CHANGE                               */
  /* ---------------------------------------------------------------------- */

  const handleDiscountChange = (value: string) => {
    const amount = Number(form.amount) || 0;
    const discount = Number(value) || 0;

    const finalAmount = Math.max(
      amount - discount,
      0
    );

    setForm((prev) => ({
      ...prev,
      discount: value,
      final_amount:
        value === "" && form.amount === ""
          ? ""
          : String(finalAmount),
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

      <h2>Add Order</h2>

      <div className="form-grid">

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
        {/* Vendor ID                                                        */}
        {/* ---------------------------------------------------------------- */}

        <OutlinedTextField
          label="Vendor ID *"
          placeholder="Enter Vendor ID"
          value={form.vendor_id}
          onInput={(e: any) =>
            handleChange(
              "vendor_id",
              e.target.value
            )
          }
        />

        {/* ---------------------------------------------------------------- */}
        {/* Service ID                                                       */}
        {/* ---------------------------------------------------------------- */}

        <OutlinedTextField
          label="Service ID *"
          placeholder="Enter Service ID"
          value={form.service_id}
          onInput={(e: any) =>
            handleChange(
              "service_id",
              e.target.value
            )
          }
        />

        {/* ---------------------------------------------------------------- */}
        {/* Booking Date                                                     */}
        {/* ---------------------------------------------------------------- */}

        <OutlinedTextField
          label="Booking Date *"
          type="date"
          value={form.booking_date}
          onInput={(e: any) =>
            handleChange(
              "booking_date",
              e.target.value
            )
          }
        />

        {/* ---------------------------------------------------------------- */}
        {/* Booking Time                                                     */}
        {/* ---------------------------------------------------------------- */}

        <OutlinedTextField
          label="Booking Time *"
          type="time"
          value={form.booking_time}
          onInput={(e: any) =>
            handleChange(
              "booking_time",
              e.target.value
            )
          }
        />

        {/* ---------------------------------------------------------------- */}
        {/* Amount                                                           */}
        {/* ---------------------------------------------------------------- */}

        <OutlinedTextField
          label="Amount *"
          placeholder="Enter Amount"
          type="number"
          value={form.amount}
          onInput={(e: any) =>
            handleAmountChange(
              e.target.value
            )
          }
        />

        {/* ---------------------------------------------------------------- */}
        {/* Discount                                                         */}
        {/* ---------------------------------------------------------------- */}

        <OutlinedTextField
          label="Discount *"
          placeholder="Enter Discount"
          type="number"
          value={form.discount}
          onInput={(e: any) =>
            handleDiscountChange(
              e.target.value
            )
          }
        />

        {/* ---------------------------------------------------------------- */}
        {/* Final Amount                                                     */}
        {/* ---------------------------------------------------------------- */}

        <OutlinedTextField
          label="Final Amount *"
          placeholder="Final Amount"
          type="number"
          value={form.final_amount}
          onInput={(e: any) =>
            handleChange(
              "final_amount",
              e.target.value
            )
          }
        />

        {/* ---------------------------------------------------------------- */}
        {/* Booking Status                                                   */}
        {/* ---------------------------------------------------------------- */}

        <OutlinedTextField
          label="Booking Status *"
          placeholder="Pending / Confirmed / Completed / Cancelled"
          value={form.booking_status}
          onInput={(e: any) =>
            handleChange(
              "booking_status",
              e.target.value
            )
          }
        />

        {/* ---------------------------------------------------------------- */}
        {/* Payment Status                                                   */}
        {/* ---------------------------------------------------------------- */}

        <OutlinedTextField
          label="Payment Status *"
          placeholder="Pending / Paid / Failed / Refunded"
          value={form.payment_status}
          onInput={(e: any) =>
            handleChange(
              "payment_status",
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

export default OrdersForm;

