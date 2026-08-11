import { useState } from "react";
import {
  OutlinedTextField,
  FilledButton,
} from "@skylabs-monorepo/shared-ui/react";

interface Props {
  onClose: () => void;
  onSave: (data: any) => void;
}

export function CustomerForm({
  onClose,
  onSave,
}: Props) {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    gender: "Male",
    dob: "",
    profileImage: "",
    status: "Active",
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
    <div className="showcase__card">

      <h2>Add Customer</h2>

      <div className="form-grid">

        {/* ---------------------------------------------------------------- */}
        {/* First Name                                                       */}
        {/* ---------------------------------------------------------------- */}

        <OutlinedTextField
          label="First Name *"
          placeholder="Enter First Name"
          value={form.firstName}
          onInput={(e: any) =>
            handleChange(
              "firstName",
              e.target.value
            )
          }
        />

        {/* ---------------------------------------------------------------- */}
        {/* Last Name                                                        */}
        {/* ---------------------------------------------------------------- */}

        <OutlinedTextField
          label="Last Name *"
          placeholder="Enter Last Name"
          value={form.lastName}
          onInput={(e: any) =>
            handleChange(
              "lastName",
              e.target.value
            )
          }
        />

        {/* ---------------------------------------------------------------- */}
        {/* Email                                                            */}
        {/* ---------------------------------------------------------------- */}

        <OutlinedTextField
          label="Email *"
          placeholder="customer@example.com"
          type="email"
          value={form.email}
          onInput={(e: any) =>
            handleChange(
              "email",
              e.target.value
            )
          }
        />

        {/* ---------------------------------------------------------------- */}
        {/* Phone                                                            */}
        {/* ---------------------------------------------------------------- */}

        <OutlinedTextField
          label="Phone *"
          placeholder="Enter Phone Number"
          type="tel"
          value={form.phone}
          onInput={(e: any) =>
            handleChange(
              "phone",
              e.target.value
            )
          }
        />

        {/* ---------------------------------------------------------------- */}
        {/* Gender                                                           */}
        {/* ---------------------------------------------------------------- */}

        <OutlinedTextField
          label="Gender *"
          placeholder="Male / Female / Other"
          value={form.gender}
          onInput={(e: any) =>
            handleChange(
              "gender",
              e.target.value
            )
          }
        />

        {/* ---------------------------------------------------------------- */}
        {/* Date of Birth                                                    */}
        {/* ---------------------------------------------------------------- */}

        <OutlinedTextField
          label="Date of Birth"
          type="date"
          value={form.dob}
          onInput={(e: any) =>
            handleChange(
              "dob",
              e.target.value
            )
          }
        />

        {/* ---------------------------------------------------------------- */}
        {/* Profile Image                                                    */}
        {/* ---------------------------------------------------------------- */}

        <OutlinedTextField
          label="Profile Image"
          placeholder="https://example.com/profile.jpg"
          value={form.profileImage}
          onInput={(e: any) =>
            handleChange(
              "profileImage",
              e.target.value
            )
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
            handleChange(
              "status",
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

export default CustomerForm;

