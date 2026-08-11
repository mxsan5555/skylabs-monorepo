import { useState } from "react";
import {
  OutlinedTextField,
  FilledButton,
} from "@skylabs-monorepo/shared-ui/react";

interface Props {
  onClose: () => void;
  onSave: (data: any) => void;
}

export function AddressForm({
  onClose,
  onSave,
}: Props) {
  const [form, setForm] = useState({
    customer_id: "",
    label: "Home",
    address_line_1: "",
    address_line_2: "",
    landmark: "",
    city: "",
    state: "",
    pincode: "",
    latitude: "",
    longitude: "",
    is_default: "No",
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
    <div className="address-form">

      <h2>Add Address</h2>

      <div className="address-form-grid">

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
        {/* Label                                                            */}
        {/* ---------------------------------------------------------------- */}

        <OutlinedTextField
          label="Label"
          placeholder="Home / Work / Other"
          value={form.label}
          onInput={(e: any) =>
            handleChange(
              "label",
              e.target.value
            )
          }
        />

        {/* ---------------------------------------------------------------- */}
        {/* Address Line 1                                                   */}
        {/* ---------------------------------------------------------------- */}

        <OutlinedTextField
          label="Address Line 1"
          placeholder="Enter Address Line 1"
          value={form.address_line_1}
          onInput={(e: any) =>
            handleChange(
              "address_line_1",
              e.target.value
            )
          }
        />

        {/* ---------------------------------------------------------------- */}
        {/* Address Line 2                                                   */}
        {/* ---------------------------------------------------------------- */}

        <OutlinedTextField
          label="Address Line 2"
          placeholder="Apartment, Floor, Building etc."
          value={form.address_line_2}
          onInput={(e: any) =>
            handleChange(
              "address_line_2",
              e.target.value
            )
          }
        />

        {/* ---------------------------------------------------------------- */}
        {/* Landmark                                                         */}
        {/* ---------------------------------------------------------------- */}

        <OutlinedTextField
          label="Landmark"
          placeholder="Enter Nearby Landmark"
          value={form.landmark}
          onInput={(e: any) =>
            handleChange(
              "landmark",
              e.target.value
            )
          }
        />

        {/* ---------------------------------------------------------------- */}
        {/* City                                                             */}
        {/* ---------------------------------------------------------------- */}

        <OutlinedTextField
          label="City"
          placeholder="Enter City"
          value={form.city}
          onInput={(e: any) =>
            handleChange(
              "city",
              e.target.value
            )
          }
        />

        {/* ---------------------------------------------------------------- */}
        {/* State                                                            */}
        {/* ---------------------------------------------------------------- */}

        <OutlinedTextField
          label="State"
          placeholder="Enter State"
          value={form.state}
          onInput={(e: any) =>
            handleChange(
              "state",
              e.target.value
            )
          }
        />

        {/* ---------------------------------------------------------------- */}
        {/* Pincode                                                          */}
        {/* ---------------------------------------------------------------- */}

        <OutlinedTextField
          label="Pincode"
          placeholder="Enter Pincode"
          type="number"
          value={form.pincode}
          onInput={(e: any) =>
            handleChange(
              "pincode",
              e.target.value
            )
          }
        />

        {/* ---------------------------------------------------------------- */}
        {/* Latitude                                                         */}
        {/* ---------------------------------------------------------------- */}

        <OutlinedTextField
          label="Latitude"
          placeholder="Enter Latitude"
          type="number"
          value={form.latitude}
          onInput={(e: any) =>
            handleChange(
              "latitude",
              e.target.value
            )
          }
        />

        {/* ---------------------------------------------------------------- */}
        {/* Longitude                                                        */}
        {/* ---------------------------------------------------------------- */}

        <OutlinedTextField
          label="Longitude"
          placeholder="Enter Longitude"
          type="number"
          value={form.longitude}
          onInput={(e: any) =>
            handleChange(
              "longitude",
              e.target.value
            )
          }
        />

        {/* ---------------------------------------------------------------- */}
        {/* Is Default                                                       */}
        {/* ---------------------------------------------------------------- */}

        <OutlinedTextField
          label="Is Default"
          placeholder="Yes / No"
          value={form.is_default}
          onInput={(e: any) =>
            handleChange(
              "is_default",
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

export default AddressForm;
