import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  FilledButton,
  TextButton,
  OutlinedTextField,
  OutlinedSelect,
  SelectOption,
} from '@skylabs-monorepo/shared-ui/react';

import { AdminPage } from '../../../admin/admin-page';

const value = (e: Event) => (e.target as HTMLInputElement).value;

export function AddCategory() {
  const navigate = useNavigate();

  const [categoryName, setCategoryName] = useState('');
  const [status, setStatus] = useState('Active');

  const handleSubmit = () => {
    console.log({
      categoryName,
      status,
    });

    navigate('/master-data/categories');
  };

  return (
    <AdminPage
      title="Add Category"
      subtitle="Create a new category"
    >
      <section className="account-card">
        <div className="address-form">
          <OutlinedTextField
            label="Category Name"
            value={categoryName}
            onInput={(e: Event) =>
              setCategoryName(value(e))
            }
          />

          <OutlinedSelect
            label="Status"
            value={status}
            onChange={(e: Event) =>
              setStatus(
                (e.target as HTMLSelectElement).value,
              )
            }
          >
            <SelectOption value="Active">
              Active
            </SelectOption>

            <SelectOption value="Inactive">
              Inactive
            </SelectOption>
          </OutlinedSelect>

          <div className="address-form__actions">
            <TextButton
              onClick={() =>
                navigate('/master-data/categories')
              }
            >
              Cancel
            </TextButton>

            <FilledButton onClick={handleSubmit}>
              Submit
            </FilledButton>
          </div>
        </div>
      </section>
    </AdminPage>
  );
}

export default AddCategory;