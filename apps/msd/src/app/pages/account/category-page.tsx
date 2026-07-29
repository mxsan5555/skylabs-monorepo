import { useState } from "react";
import { FilledButton } from "@skylabs-monorepo/shared-ui/react";
import { CategoryForm } from "./category-form";

interface Category {
    id: number;
    categoryName: string;
    categorySlug: string;
    iconImage: String;
    bannerImage: String;
    status: String;
    isFeatured: String;
    displayOrder: number;
    metaTitle: string;
    metaDescription: string;
    description: string;
    applicableCities: String;
}

export function CategoryPage() {
    const [open, setOpen] = useState(false);

    const [categories, setCategories] = useState<Category[]>([
        {
            id: 1,
            categoryName: "Hair Care",
            categorySlug: "hair-care",
            iconImage: "",
            bannerImage: "",
            status: "",
            isFeatured: "",
            displayOrder: 1,
            metaTitle: "Hair",
            metaDescription: "Hair Category",
            applicableCities: "",
            description: "Hair Products",
        },
    ]);

    const handleSave = (category: Omit<Category, "id">) => {
        const newCategory: Category = {
            id: Date.now(),
            ...category,
        };

        setCategories((prev) => [...prev, newCategory]);

        // Close the form
        setOpen(false);
    };

    return (
        <div className="category-page">

            {/* Header */}
            <div className="page-header">
                <h1>Category</h1>

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
                <CategoryForm
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
                            {categories.map((item) => (
                                <tr key={item.id}>
                                    <td>{item.id}</td>
                                    <td>{item.categoryName}</td>
                                    <td>{item.categorySlug}</td>
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