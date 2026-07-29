import { useState } from "react";
import {
    OutlinedTextField,
    FilledButton,
} from "@skylabs-monorepo/shared-ui/react";

interface Props {
    onClose: () => void;
    onSave: (data: any) => void;
}

export function CategoryForm({
    onClose,
    onSave,
}: Props) {
    const [form, setForm] = useState({
        categoryName: "",
        categorySlug: "",
        iconImage: "",
        bannerImage: "",
        description: "",
        displayOrder: 1,
        status: "",
        isFeatured: "",
        metaTitle: "",
        metaDescription: "",
        applicableCities: "",
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

            <h2>Add Category</h2>

            <div className="category-form-grid">

                <OutlinedTextField
                    label="Category Name"
                    value={form.categoryName}
                    onInput={(e: any) =>
                        handleChange("categoryName", e.target.value)
                    }
                />

                <OutlinedTextField
                    label="Category Slug"
                    value={form.categorySlug}
                    onInput={(e: any) =>
                        handleChange("categorySlug", e.target.value)
                    }
                />

                <OutlinedTextField
                    label="Icon Image"
                    value={String(form.iconImage)}
                    onInput={(e: any) =>
                        handleChange("iconImage", e.target.value)
                    }
                />
                <OutlinedTextField
                    label="Banner Image"
                    value={String(form.bannerImage)}
                    onInput={(e: any) =>
                        handleChange("bannerImage", e.target.value)
                    }
                />
                <OutlinedTextField
                    label="Description"
                    type="textarea"
                    rows={5}
                    value={String(form.description)}
                    onInput={(e: any) =>
                        handleChange("description", e.target.value)
                    }
                />
                <OutlinedTextField
                    label="Display Order"
                    type="number"
                    value={String(form.displayOrder)}
                    onInput={(e: any) =>
                        handleChange("displayOrder", e.target.value)
                    }
                />

                <OutlinedTextField
                    label="Status"
                    value={form.status}
                    onInput={(e: any) =>
                        handleChange("status", e.target.value)
                    }
                />
                <OutlinedTextField
                    label="Is Featured"
                    value={form.isFeatured}
                    onInput={(e: any) =>
                        handleChange("isFeatured", e.target.value)
                    }
                />

                <OutlinedTextField
                    label="Meta Title"
                    value={form.metaTitle}
                    onInput={(e: any) =>
                        handleChange("metaTitle", e.target.value)
                    }
                />


                <OutlinedTextField
                    label="Meta Description"
                    type="textarea"
                    rows={3}
                    value={form.metaDescription}
                    onInput={(e: any) =>
                        handleChange("metaDescription", e.target.value)
                    }
                />

                <OutlinedTextField
                    label="Applicable Cities"
                    value={form.applicableCities}
                    onInput={(e: any) =>
                        handleChange("applicableCities", e.target.value)
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