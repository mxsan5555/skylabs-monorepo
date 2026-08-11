import { useState } from "react";
import {
  OutlinedTextField,
  FilledButton,
} from "@skylabs-monorepo/shared-ui/react";

interface Props {
  onClose: () => void;
  onSave: (data: any) => void;
}

export function DealForm({ onClose, onSave }: Props) {
  const [form, setForm] = useState({
    vendor_id: "",
    title: "",
    description: "",
    discount_type: "Percentage",
    discount_value: "",
    start_date: "",
    end_date: "",
    max_usage: "",
    status: "Active",
  });

  /* ---------------------------------------------------------------------- */
  /*                              HANDLE CHANGE                             */
  /* ---------------------------------------------------------------------- */

  const handleChange = (key: string, value: any) => {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  /* ---------------------------------------------------------------------- */
  /*                                SAVE                                    */
  /* ---------------------------------------------------------------------- */

  const handleSave = () => {
    const currentDate = new Date().toISOString();

    const dealData = {
      ...form,

    };

    onSave(dealData);
    onClose();
  };

  return (
    <div className="showcase-card">

      <h2>Add Deal</h2>

      <div className="form-grid">

        <OutlinedTextField
          label="Vendor ID *"
          placeholder="Enter Vendor ID"
          value={form.vendor_id}
          onInput={(e: any) =>
            handleChange("vendor_id", e.target.value)
          }
        />

        {/* ---------------------------------------------------------------- */}
        {/* Title                                                            */}
        {/* ---------------------------------------------------------------- */}

        <OutlinedTextField
          label="Title *"
          placeholder="Enter Deal Title"
          value={form.title}
          onInput={(e: any) =>
            handleChange("title", e.target.value)
          }
        />

        {/* ---------------------------------------------------------------- */}
        {/* Discount Type                                                    */}
        {/* ---------------------------------------------------------------- */}

        <OutlinedTextField
          label="Discount Type *"
          placeholder="Percentage / Flat"
          value={form.discount_type}
          onInput={(e: any) =>
            handleChange("discount_type", e.target.value)
          }
        />

        {/* ---------------------------------------------------------------- */}
        {/* Discount Value                                                   */}
        {/* ---------------------------------------------------------------- */}

        <OutlinedTextField
          label="Discount Value *"
          placeholder="Enter Discount Value"
          value={form.discount_value}
          onInput={(e: any) =>
            handleChange("discount_value", e.target.value)
          }
        />

        {/* ---------------------------------------------------------------- */}
        {/* Start Date                                                       */}
        {/* ---------------------------------------------------------------- */}

        <OutlinedTextField
          label="Start Date *"
          type="date"
          value={form.start_date}
          onInput={(e: any) =>
            handleChange("start_date", e.target.value)
          }
        />

        {/* ---------------------------------------------------------------- */}
        {/* End Date                                                         */}
        {/* ---------------------------------------------------------------- */}

        <OutlinedTextField
          label="End Date *"
          type="date"
          value={form.end_date}
          onInput={(e: any) =>
            handleChange("end_date", e.target.value)
          }
        />

        {/* ---------------------------------------------------------------- */}
        {/* Max Usage                                                        */}
        {/* ---------------------------------------------------------------- */}

        <OutlinedTextField
          label="Max Usage"
          placeholder="Enter Maximum Usage"
          value={form.max_usage}
          onInput={(e: any) =>
            handleChange("max_usage", e.target.value)
          }
        />

        {/* ---------------------------------------------------------------- */}
        {/* Status                                                           */}
        {/* ---------------------------------------------------------------- */}

        <OutlinedTextField
          label="Status *"
          placeholder="Active / Inactive"
          value={form.status}
          onInput={(e: any) =>
            handleChange("status", e.target.value)
          }
        />

        {/* ---------------------------------------------------------------- */}
        {/* Description                                                      */}
        {/* ---------------------------------------------------------------- */}

        <OutlinedTextField
          label="Description *"
          type="textarea"
          rows={5}
          value={form.description}
          onInput={(e: any) =>
            handleChange("description", e.target.value)
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

export default DealForm;

