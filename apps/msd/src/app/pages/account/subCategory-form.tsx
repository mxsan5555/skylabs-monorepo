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
        subcategoryName: "",
        subcategorySlug: "",
        iconImage: "",
        description: "",
        displayOrder: 1,
        status: "",
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

            <h2>Add Sub Category</h2>

            <div className="category-form-grid">

                <OutlinedTextField
                    label="Sub Category Name"
                    value={form.subcategoryName}
                    onInput={(e: any) =>
                        handleChange("subcategoryName", e.target.value)
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
                    label="Icon Image"
                    value={String(form.iconImage)}
                    onInput={(e: any) =>
                        handleChange("iconImage", e.target.value)
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