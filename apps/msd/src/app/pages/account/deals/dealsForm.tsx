import { useState } from "react";
import {
  OutlinedTextField,
  FilledButton,
} from "@skylabs-monorepo/shared-ui/react";

interface Props {
  onClose: () => void;
  onSave: (data: any) => void;
}

export function DealsForm({ onClose, onSave }: Props) {
  const [form, setForm] = useState({
    slug: "",
    title: "",
    providerId: "",
    providerName: "",
    categorySlug: "",
    subcategorySlug: "",
    description: "",
    image: "",
    imageAlt: "",
    gallery: "",
    options: "",
    features: "",
    howToUse: "",
    rating: "",
    reviews: "",
    distance: "",
    location: "",
    isOpen: "Active",
    tags: "",
    badge: "",
  });

  const handleChange = (key: string, value: any) => {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  // Auto generate slug from title
  const handleDealTitle = (value: string) => {
    handleChange("title", value);

    handleChange(
      "slug",
      value
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "-")
        .replace(/[^\w-]+/g, "")
    );
  };

  const handleSave = () => {
    onSave({
      ...form,
      gallery: form.gallery
        .split("\n")
        .map((g) => g.trim())
        .filter(Boolean),

      options: form.options
        .split("\n")
        .map((o) => o.trim())
        .filter(Boolean),

      features: form.features
        .split(",")
        .map((f) => f.trim())
        .filter(Boolean),

      howToUse: form.howToUse
        .split(",")
        .map((h) => h.trim())
        .filter(Boolean),

      tags: form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    });

    onClose();
  };

  return (
    <div className="showcase__card">
      <h2>Add Deal</h2>

      <div className="category-form-grid">

        <OutlinedTextField
          label="Deal Title *"
          value={form.title}
          onInput={(e: any) => handleDealTitle(e.target.value)}
        />

        <OutlinedTextField
          label="Deal Slug *"
          value={form.slug}
          onInput={(e: any) =>
            handleChange("slug", e.target.value)
          }
        />

        <OutlinedTextField
          label="Provider ID *"
          value={form.providerId}
          onInput={(e: any) =>
            handleChange("providerId", e.target.value)
          }
        />

        <OutlinedTextField
          label="Provider Name *"
          value={form.providerName}
          onInput={(e: any) =>
            handleChange("providerName", e.target.value)
          }
        />

        <OutlinedTextField
          label="Category Slug *"
          value={form.categorySlug}
          onInput={(e: any) =>
            handleChange("categorySlug", e.target.value)
          }
        />

        <OutlinedTextField
          label="Sub Category Slug"
          value={form.subcategorySlug}
          onInput={(e: any) =>
            handleChange("subcategorySlug", e.target.value)
          }
        />

        <OutlinedTextField
          label="Description"
          type="textarea"
          rows={4}
          value={form.description}
          onInput={(e: any) =>
            handleChange("description", e.target.value)
          }
        />

        <OutlinedTextField
          label="Image URL"
          value={form.image}
          onInput={(e: any) =>
            handleChange("image", e.target.value)
          }
        />

        <OutlinedTextField
          label="Image Alt"
          value={form.imageAlt}
          onInput={(e: any) =>
            handleChange("imageAlt", e.target.value)
          }
        />

        <OutlinedTextField
          label="Gallery Images"
          type="textarea"
          rows={3}
          placeholder="One image URL per line"
          value={form.gallery}
          onInput={(e: any) =>
            handleChange("gallery", e.target.value)
          }
        />

        <OutlinedTextField
          label="Options"
          type="textarea"
          rows={3}
          placeholder="One option per line"
          value={form.options}
          onInput={(e: any) =>
            handleChange("options", e.target.value)
          }
        />

        <OutlinedTextField
          label="Features"
          placeholder="AC Room, Parking, Certified Staff"
          value={form.features}
          onInput={(e: any) =>
            handleChange("features", e.target.value)
          }
        />

        <OutlinedTextField
          label="How To Use"
          placeholder="Book Online, Visit Store"
          value={form.howToUse}
          onInput={(e: any) =>
            handleChange("howToUse", e.target.value)
          }
        />

        <OutlinedTextField
          label="Rating"
          type="number"
          value={String(form.rating)}
          onInput={(e: any) =>
            handleChange("rating", e.target.value)
          }
        />

        <OutlinedTextField
          label="Reviews"
          type="number"
          value={String(form.reviews)}
          onInput={(e: any) =>
            handleChange("reviews", e.target.value)
          }
        />

        <OutlinedTextField
          label="Distance (KM)"
          type="number"
          value={String(form.distance)}
          onInput={(e: any) =>
            handleChange("distance", e.target.value)
          }
        />

        <OutlinedTextField
          label="Location"
          value={form.location}
          onInput={(e: any) =>
            handleChange("location", e.target.value)
          }
        />

        <OutlinedTextField
          label="Open Status"
          placeholder="Active / Inactive"
          value={form.isOpen}
          onInput={(e: any) =>
            handleChange("isOpen", e.target.value)
          }
        />

        <OutlinedTextField
          label="Tags"
          placeholder="Best Seller, Trending"
          value={form.tags}
          onInput={(e: any) =>
            handleChange("tags", e.target.value)
          }
        />

        <OutlinedTextField
          label="Badge"
          placeholder="30% OFF"
          value={form.badge}
          onInput={(e: any) =>
            handleChange("badge", e.target.value)
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

export default DealsForm;