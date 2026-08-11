import { useState } from "react";
import {
  OutlinedTextField,
  FilledButton,
} from "@skylabs-monorepo/shared-ui/react";

interface Props {
  onClose: () => void;
  onSave: (data: any) => void;
}

export function ProductsForm({
  onClose,
  onSave,
}: Props) {
  const [form, setForm] = useState({
    vendor_id: "",
    category_id: "",
    name: "",
    description: "",
    price: "",
    discount_price: "",
    stock: "",
    sku: "",
    images: "",
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
  /*                         PRICE VALIDATION                                */
  /* ---------------------------------------------------------------------- */

  const handleDiscountPriceChange = (
    value: string
  ) => {
    const price = Number(form.price) || 0;
    const discountPrice = Number(value) || 0;

    if (
      value !== "" &&
      discountPrice > price
    ) {
      return;
    }

    handleChange(
      "discount_price",
      value
    );
  };

  /* ---------------------------------------------------------------------- */
  /*                                SAVE                                    */
  /* ---------------------------------------------------------------------- */

  const handleSave = () => {
    onSave(form);
    onClose();
  };

  return (
    <div className="showcase-card">

      <h2>Add Product</h2>

      <div className="form-grid">

        {/* ---------------------------------------------------------------- */}
        {/* Vendor ID                                                        */}
        {/* ---------------------------------------------------------------- */}

        <OutlinedTextField
          label="Vendor ID *"
          placeholder="Enter Vendor ID"
          value={form.vendor_id}
          onInput={(e: any) =>
            handleChange(
              "vendor_id",
              e.target.value
            )
          }
        />

        {/* ---------------------------------------------------------------- */}
        {/* Category ID                                                      */}
        {/* ---------------------------------------------------------------- */}

        <OutlinedTextField
          label="Category ID *"
          placeholder="Enter Category ID"
          value={form.category_id}
          onInput={(e: any) =>
            handleChange(
              "category_id",
              e.target.value
            )
          }
        />

        {/* ---------------------------------------------------------------- */}
        {/* Product Name                                                     */}
        {/* ---------------------------------------------------------------- */}

        <OutlinedTextField
          label="Product Name *"
          placeholder="Enter Product Name"
          value={form.name}
          onInput={(e: any) =>
            handleChange(
              "name",
              e.target.value
            )
          }
        />

        {/* ---------------------------------------------------------------- */}
        {/* Price                                                            */}
        {/* ---------------------------------------------------------------- */}

        <OutlinedTextField
          label="Price *"
          placeholder="Enter Product Price"
          type="number"
          value={form.price}
          onInput={(e: any) =>
            handleChange(
              "price",
              e.target.value
            )
          }
        />

        {/* ---------------------------------------------------------------- */}
        {/* Discount Price                                                   */}
        {/* ---------------------------------------------------------------- */}

        <OutlinedTextField
          label="Discount Price"
          placeholder="Enter Discount Price"
          type="number"
          value={form.discount_price}
          onInput={(e: any) =>
            handleDiscountPriceChange(
              e.target.value
            )
          }
        />

        {/* ---------------------------------------------------------------- */}
        {/* Stock                                                            */}
        {/* ---------------------------------------------------------------- */}

        <OutlinedTextField
          label="Stock *"
          placeholder="Enter Stock Quantity"
          type="number"
          value={form.stock}
          onInput={(e: any) =>
            handleChange(
              "stock",
              e.target.value
            )
          }
        />

        {/* ---------------------------------------------------------------- */}
        {/* SKU                                                              */}
        {/* ---------------------------------------------------------------- */}

        <OutlinedTextField
          label="SKU *"
          placeholder="Enter Product SKU"
          value={form.sku}
          onInput={(e: any) =>
            handleChange(
              "sku",
              e.target.value
            )
          }
        />

        {/* ---------------------------------------------------------------- */}
        {/* Images                                                           */}
        {/* ---------------------------------------------------------------- */}

        <OutlinedTextField
          label="Images *"
          placeholder="https://example.com/product.jpg"
          value={form.images}
          onInput={(e: any) =>
            handleChange(
              "images",
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

        {/* ---------------------------------------------------------------- */}
        {/* Description                                                      */}
        {/* ---------------------------------------------------------------- */}

        <OutlinedTextField
          label="Description *"
          type="textarea"
          rows={5}
          placeholder="Enter Product Description"
          value={form.description}
          onInput={(e: any) =>
            handleChange(
              "description",
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

export default ProductsForm;

