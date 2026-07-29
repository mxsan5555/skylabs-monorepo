import { useState } from "react";
import { FilledButton } from "@skylabs-monorepo/shared-ui/react";
import { SubCategoryForm } from "./subCategory-form";

interface SubCategory {
        id: number;
    subcategoryName: string;
    subcategorySlug: string;
    iconImage: string;
    description: string;
    displayOrder: number;
    status: string;
    metaTitle: string;
    metaDescription: string;
    applicableCities: string;
    
}

export function SubCategoryPage() {
    const [open, setOpen] = useState(false);

    const [subCategories, setSubCategories] = useState<SubCategory[]>([
        {
            id: 1,
            subcategoryName: "Hair Care",
            subcategorySlug: "hair-care",
            iconImage: "",
            description: "Hair Products",
             displayOrder: 1,
            status: "",
            metaTitle: "Hair",
            metaDescription: "Hair Category",
            applicableCities: "",
        },
    ]);

    const handleSave = (category: Omit<SubCategory, "id">) => {
        const newSubCategory: SubCategory = {
            id: Date.now(),
            ...category,
        };

        setSubCategories((prev) => [...prev, newSubCategory]);

        // Close the form
        setOpen(false);
    };

    return (
        <div className="category-page">

            {/* Header */}
            <div className="page-header">
                <h1>Sub Category</h1>

                {!open && (
                    <div className="add-btn">
                        <FilledButton onClick={() => setOpen(true)}>
                            +
                        </FilledButton>
                    </div>
                )}
            </div>

            {/* FORM */}
            {open ? (
                <SubCategoryForm
                    onSave={handleSave}
                    onClose={() => setOpen(false)}
                />
            ) : (
                <>
                    {/* TABLE */}

                    <table className="category-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Name</th>
                                <th>Slug</th>
                                <th>Display Order</th>
                                <th>Action</th>
                            </tr>
                        </thead>

                        <tbody>
                            {subCategories.map((item) => (
                                <tr key={item.id}>
                                    <td>{item.id}</td>
                                    <td>{item.subcategoryName}</td>
                                    <td>{item.subcategorySlug}</td>
                                    <td>{item.displayOrder}</td>

                                    <td>
                                        Edit Delete
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </>
            )}
        </div>
    );
}