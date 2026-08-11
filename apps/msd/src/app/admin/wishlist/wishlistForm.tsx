import { useState } from "react";
import {
  OutlinedTextField,
  FilledButton,
} from "@skylabs-monorepo/shared-ui/react";

interface Props {
  onClose: () => void;
  onSave: (data: any) => void;
}

export function WishlistForm({
  onClose,
  onSave,
}: Props) {
  const [form, setForm] = useState({
    customer_id: "",
    service_id: "",
    product_id: "",
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

      <h2>Add Wishlist</h2>

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
        {/* Service ID                                                       */}
        {/* ---------------------------------------------------------------- */}

        <OutlinedTextField
          label="Service ID"
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
        {/* Product ID                                                       */}
        {/* ---------------------------------------------------------------- */}

        <OutlinedTextField
          label="Product ID"
          placeholder="Enter Product ID"
          value={form.product_id}
          onInput={(e: any) =>
            handleChange(
              "product_id",
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

export default WishlistForm;
