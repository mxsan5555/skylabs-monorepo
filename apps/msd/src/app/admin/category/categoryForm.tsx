import { useState } from "react";
import {
  OutlinedTextField,
  FilledButton,
} from "@skylabs-monorepo/shared-ui/react";

interface Props {
  onClose: () => void;
  onSave: (data: any) => void;
}

export function CategoryForm({ onClose, onSave }: Props) {
  const [form, setForm] = useState({
  category_name: "",
  category_slug: "",
  icon_image: "",
  banner_image: "",
  description: "",
  status: "Active",
  is_featured: "No",
  meta_title: "",
  meta_description: "",
});

  const handleChange = (key: string, value: any) => {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  // Auto-generate slug from category name
  const handleCategoryName = (value: string) => {
    handleChange("category_name", value);

    handleChange(
      "category_slug",
      value
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "-")
        .replace(/[^\w-]+/g, "")
    );
  };

  const handleSave = () => {
    onSave(form);
    onClose();
  };

  return (
    <div className="showcase__card">
      <h2>Add Category</h2>

      <div className="form-grid">

        {/* Category Name */}
          <OutlinedTextField
          label="Category Name *"
          value={form.category_name}
          onInput={(e: any) => handleCategoryName(e.target.value)}
        />
        

        {/* Category Slug */}
        <OutlinedTextField
          label="Category Slug *"
          value={form.category_slug}
          onInput={(e: any) =>
            handleChange("category_slug", e.target.value)
          }
        />

        {/* Icon Image */}
        <OutlinedTextField
          label="Icon Image *"
          placeholder="https://example.com/icon.png"
          value={form.icon_image}
          onInput={(e: any) =>
            handleChange("icon_image", e.target.value)
          }
        />

        {/* Banner Image */}
        <OutlinedTextField
          label="Banner Image"
          placeholder="https://example.com/banner.jpg"
          value={form.banner_image}
          onInput={(e: any) =>
            handleChange("banner_image", e.target.value)
          }
        />

        {/* Status */}
        <OutlinedTextField
          label="Status (Active / Inactive)"
          placeholder="Active"
          value={form.status}
          onInput={(e: any) =>
            handleChange("status", e.target.value)
          }
        />


                {/* Meta Title */}
        <OutlinedTextField
          label="Meta Title"
          value={form.meta_title}
          onInput={(e: any) =>
            handleChange("meta_title", e.target.value)
          }
        />

        {/* Meta Description */}
        <OutlinedTextField
          label="Meta Description"
          type="textarea"
          rows={3}
          value={form.meta_description}
          onInput={(e: any) =>
            handleChange("meta_description", e.target.value)
          }
        />

        {/* Description */}
        <OutlinedTextField
          label="Description"
          type="textarea"
          rows={5}
          value={form.description}
          onInput={(e: any) =>
            handleChange("description", e.target.value)
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

export default CategoryForm;