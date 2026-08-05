import { useState } from "react";
import {
  OutlinedTextField,
  FilledButton,
} from "@skylabs-monorepo/shared-ui/react";

interface Props {
  onClose: () => void;
  onSave: (data: any) => void;
}

export function ServiceForm({
  onClose,
  onSave,
}: Props) {
  const [form, setForm] = useState({
    subcategoryId: "",
    serviceName: "",
    serviceType: "",
    shortDescription: "",
    fullDescription: "",
    imageGallery: "",
    durationMinutes: "",
    basePrice: "",
    discountedPrice: "",
    taxPercent: "",
    whatIsIncluded: "",
    whatIsExcluded: "",
    termsAndConditions: "",
    warrantyDays: "",
    cancellationPolicy: "",
    minBookingNoticeHours: "",
    requiredSkillTag: "",
    isAddonAvailable: "",
    faqs: "",
    ratingAvg: "",
    totalBookings: "",
    applicableCities: "",
    displayOrder: "",
    status: "",
  });

  const handleChange = (key: string, value: string) => {
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

      <h2>Add Service</h2>

      <div className="category-form-grid">

        {/* Parent Subcategory */}
        <OutlinedTextField
          label="Subcategory ID"
          type="number"
          value={form.subcategoryId}
          onInput={(e: any) =>
            handleChange("subcategoryId", e.target.value)
          }
        />

        {/* Service Name */}
        <OutlinedTextField
          label="Service Name"
          value={form.serviceName}
          onInput={(e: any) =>
            handleChange("serviceName", e.target.value)
          }
        />

        {/* Service Type */}
        <OutlinedTextField
          label="Service Type (Single / Package / AMC)"
          value={form.serviceType}
          onInput={(e: any) =>
            handleChange("serviceType", e.target.value)
          }
        />

        {/* Short Description */}
        <OutlinedTextField
          label="Short Description"
          type="textarea"
          rows={3}
          value={form.shortDescription}
          onInput={(e: any) =>
            handleChange("shortDescription", e.target.value)
          }
        />

        {/* Full Description */}
        <OutlinedTextField
          label="Full Description"
          type="textarea"
          rows={5}
          value={form.fullDescription}
          onInput={(e: any) =>
            handleChange("fullDescription", e.target.value)
          }
        />

        {/* Image Gallery */}
        <OutlinedTextField
          label="Image Gallery (Image URLs)"
          type="textarea"
          rows={3}
          value={form.imageGallery}
          onInput={(e: any) =>
            handleChange("imageGallery", e.target.value)
          }
        />

        {/* Duration */}
        <OutlinedTextField
          label="Duration (Minutes)"
          type="number"
          value={form.durationMinutes}
          onInput={(e: any) =>
            handleChange("durationMinutes", e.target.value)
          }
        />

        {/* Base Price */}
        <OutlinedTextField
          label="Base Price"
          type="number"
          value={form.basePrice}
          onInput={(e: any) =>
            handleChange("basePrice", e.target.value)
          }
        />

        {/* Discounted Price */}
        <OutlinedTextField
          label="Discounted Price"
          type="number"
          value={form.discountedPrice}
          onInput={(e: any) =>
            handleChange("discountedPrice", e.target.value)
          }
        />

        {/* Tax */}
        <OutlinedTextField
          label="Tax (%)"
          type="number"
          value={form.taxPercent}
          onInput={(e: any) =>
            handleChange("taxPercent", e.target.value)
          }
        />

        {/* Included */}
        <OutlinedTextField
          label="What is Included"
          type="textarea"
          rows={4}
          value={form.whatIsIncluded}
          onInput={(e: any) =>
            handleChange("whatIsIncluded", e.target.value)
          }
        />

        {/* Excluded */}
        <OutlinedTextField
          label="What is Excluded"
          type="textarea"
          rows={4}
          value={form.whatIsExcluded}
          onInput={(e: any) =>
            handleChange("whatIsExcluded", e.target.value)
          }
        />

        {/* Terms */}
        <OutlinedTextField
          label="Terms & Conditions"
          type="textarea"
          rows={5}
          value={form.termsAndConditions}
          onInput={(e: any) =>
            handleChange("termsAndConditions", e.target.value)
          }
        />

        {/* Warranty */}
        <OutlinedTextField
          label="Warranty Days"
          type="number"
          value={form.warrantyDays}
          onInput={(e: any) =>
            handleChange("warrantyDays", e.target.value)
          }
        />

        {/* Cancellation */}
        <OutlinedTextField
          label="Cancellation Policy"
          type="textarea"
          rows={4}
          value={form.cancellationPolicy}
          onInput={(e: any) =>
            handleChange("cancellationPolicy", e.target.value)
          }
        />

        {/* Booking Notice */}
        <OutlinedTextField
          label="Minimum Booking Notice (Hours)"
          type="number"
          value={form.minBookingNoticeHours}
          onInput={(e: any) =>
            handleChange("minBookingNoticeHours", e.target.value)
          }
        />

        {/* Skill Tag */}
        <OutlinedTextField
          label="Required Skill Tags"
          value={form.requiredSkillTag}
          onInput={(e: any) =>
            handleChange("requiredSkillTag", e.target.value)
          }
        />

        {/* Addon */}
        <OutlinedTextField
          label="Addon Available (Yes / No)"
          value={form.isAddonAvailable}
          onInput={(e: any) =>
            handleChange("isAddonAvailable", e.target.value)
          }
        />

        {/* FAQs */}
        <OutlinedTextField
          label="FAQs"
          type="textarea"
          rows={5}
          value={form.faqs}
          onInput={(e: any) =>
            handleChange("faqs", e.target.value)
          }
        />

        {/* Rating */}
        <OutlinedTextField
          label="Average Rating"
          type="number"
          value={form.ratingAvg}
          onInput={(e: any) =>
            handleChange("ratingAvg", e.target.value)
          }
        />

        {/* Bookings */}
        <OutlinedTextField
          label="Total Bookings"
          type="number"
          value={form.totalBookings}
          onInput={(e: any) =>
            handleChange("totalBookings", e.target.value)
          }
        />

        {/* Cities */}
        <OutlinedTextField
          label="Applicable Cities / Pincodes"
          type="textarea"
          rows={3}
          value={form.applicableCities}
          onInput={(e: any) =>
            handleChange("applicableCities", e.target.value)
          }
        />

        {/* Display Order */}
        <OutlinedTextField
          label="Display Order"
          type="number"
          value={form.displayOrder}
          onInput={(e: any) =>
            handleChange("displayOrder", e.target.value)
          }
        />

        {/* Status */}
        <OutlinedTextField
          label="Status (Active / Inactive)"
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

export default ServiceForm;