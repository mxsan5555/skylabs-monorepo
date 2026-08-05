import { useState } from "react";
import {
    OutlinedTextField,
    FilledButton,
} from "@skylabs-monorepo/shared-ui/react";

interface Props {
    onClose: () => void;
    onSave: (data: any) => void;
}

export function VendorForm({ onClose, onSave }: Props) {
    const [form, setForm] = useState({
        slug: "",
        name: "",
        description: "",
        address: "",
        city: "",
        location: "",
        latitude: "",
        longitude: "",
        phone: "",
        email: "",
        website: "",
        image: "",
        imageAlt: "",
        gallery: "",
        rating: "",
        reviews: "",
        openingHours: "",
        features: "",
        status: "Active",
    });


    const handleChange = (key: string, value: any) => {
        setForm((prev) => ({
            ...prev,
            [key]: value,
        }));
    };

    // Auto-generate slug from category name
    const handleVendorName = (value: string) => {
        handleChange("name", value);

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
        onSave(form);
        onClose();
    };

    return (
        <div className="showcase__card">
            <h2>Add Vendor</h2>

            <div className="category-form-grid">

                <OutlinedTextField
                    label="Vendor Name *"
                    value={form.name}
                    onInput={(e: any) => handleVendorName(e.target.value)}
                />

                <OutlinedTextField
                    label="Vendor Slug *"
                    value={form.slug}
                    onInput={(e: any) => handleChange("slug", e.target.value)}
                />

                <OutlinedTextField
                    label="Description"
                    type="textarea"
                    rows={4}
                    value={form.description}
                    onInput={(e: any) => handleChange("description", e.target.value)}
                />

                <OutlinedTextField
                    label="Address *"
                    value={form.address}
                    onInput={(e: any) => handleChange("address", e.target.value)}
                />

                <OutlinedTextField
                    label="City *"
                    value={form.city}
                    onInput={(e: any) => handleChange("city", e.target.value)}
                />

                <OutlinedTextField
                    label="Location"
                    value={form.location}
                    onInput={(e: any) => handleChange("location", e.target.value)}
                />

                <OutlinedTextField
                    label="Latitude"
                    value={form.latitude}
                    onInput={(e: any) => handleChange("latitude", e.target.value)}
                />

                <OutlinedTextField
                    label="Longitude"
                    value={form.longitude}
                    onInput={(e: any) => handleChange("longitude", e.target.value)}
                />

                <OutlinedTextField
                    label="Phone *"
                    value={form.phone}
                    onInput={(e: any) => handleChange("phone", e.target.value)}
                />

                <OutlinedTextField
                    label="Email"
                    value={form.email}
                    onInput={(e: any) => handleChange("email", e.target.value)}
                />

                <OutlinedTextField
                    label="Website"
                    value={form.website}
                    onInput={(e: any) => handleChange("website", e.target.value)}
                />

                <OutlinedTextField
                    label="Vendor Image"
                    value={form.image}
                    onInput={(e: any) => handleChange("image", e.target.value)}
                />

                <OutlinedTextField
                    label="Image Alt"
                    value={form.imageAlt}
                    onInput={(e: any) => handleChange("imageAlt", e.target.value)}
                />

                <OutlinedTextField
                    label="Gallery Images"
                    type="textarea"
                    rows={3}
                    value={form.gallery}
                    onInput={(e: any) => handleChange("gallery", e.target.value)}
                />

                <OutlinedTextField
                    label="Rating"
                    type="number"
                    value={String(form.rating)}
                    onInput={(e: any) => handleChange("rating", e.target.value)}
                />

                <OutlinedTextField
                    label="Reviews"
                    type="number"
                    value={String(form.reviews)}
                    onInput={(e: any) => handleChange("reviews", e.target.value)}
                />

                <OutlinedTextField
                    label="Opening Hours"
                    value={form.openingHours}
                    onInput={(e: any) => handleChange("openingHours", e.target.value)}
                />

                <OutlinedTextField
                    label="Features"
                    value={form.features}
                    onInput={(e: any) => handleChange("features", e.target.value)}
                />

                <OutlinedTextField
                    label="Status (Active / Inactive)"
                    value={form.status}
                    onInput={(e: any) => handleChange("status", e.target.value)}
                />

            </div>

            <div className="form-actions">
                <FilledButton onClick={handleSave}>Save</FilledButton>

                <FilledButton onClick={onClose}>Cancel</FilledButton>
            </div>
        </div>
    );
}

export default VendorForm;