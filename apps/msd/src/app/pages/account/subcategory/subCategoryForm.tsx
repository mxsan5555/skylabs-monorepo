import { useState } from "react";
import {
  OutlinedTextField,
  FilledButton,
} from "@skylabs-monorepo/shared-ui/react";

interface Props {
  onClose: () => void;
  onSave: (data: any) => void;
}

export function SubCategoryForm({
  onClose,
  onSave,
}: Props) {
  const [form, setForm] = useState({
    category_id: "",
    subcategory_name: "",
    subcategory_slug: "",
    icon_image: "",
    description: "",
    status: "Active",
  });

  const handleChange = (key: string, value: any) => {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleSave = () => {
    onSave(form);
  };

  return (
    <div className="showcase__card">

      <h2>Add Sub Category</h2>

      <div className="category-form-grid">

        {/* Parent Category */}

        <OutlinedTextField
          label="Category ID *"
          placeholder="Enter Category ID"
          value={form.category_id}
          onInput={(e: any) =>
            handleChange("category_id", e.target.value)
          }
        />

        <OutlinedTextField
          label="Sub Category Name *"
          value={form.subcategory_name}
          onInput={(e: any) =>
            handleChange("subcategoryName", e.target.value)
          }
        />

        <OutlinedTextField
          label="Sub Category Slug *"
          value={form.subcategory_slug}
          onInput={(e: any) =>
            handleChange("subcategory_slug", e.target.value)
          }
        />

        <OutlinedTextField
          label="Icon Image *"
          placeholder="https://example.com/icon.png"
          value={form.icon_image}
          onInput={(e: any) =>
            handleChange("icon_image", e.target.value)
          }
        />

        <OutlinedTextField
          label="Description"
          type="textarea"
          rows={5}
          value={form.description}
          onInput={(e: any) =>
            handleChange("description", e.target.value)
          }
        />

        <OutlinedTextField
          label="Status (Active / Inactive)"
          placeholder="Active"
          value={form.status}
          onInput={(e: any) =>
            handleChange("status", e.target.value)
          }
        />

      </div>

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

export default SubCategoryForm;