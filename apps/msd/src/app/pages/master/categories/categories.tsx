import { useNavigate } from 'react-router-dom';

import { OutlinedButton, Icon, IconButton } from '@skylabs-monorepo/shared-ui/react';

import { AdminPage } from '../../../admin/admin-page';

export function Categories() {
    const categories = [
        {
            id: '1',
            name: 'Electronics',
            status: 'Active',
        },
        {
            id: '2',
            name: 'Fashion',
            status: 'Inactive',
        },
    ];
    const navigate = useNavigate();

    return (
        <AdminPage
            title="Categories"
            subtitle="Manage category master data."
        >
            <section className="account-card">
                <div className="account-card__head">
                    <h2>Categories</h2>

                    <OutlinedButton
                        onClick={() =>
                            navigate('/master-data/categories/add')
                        }
                    >
                        <Icon slot="icon">add</Icon>
                        Add Category
                    </OutlinedButton>
                </div>

                <table className="category-table">
                    <thead>
                        <tr>
                            <th>Category Name</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>

                    <tbody>
                        {categories.map((category) => (
                            <tr key={category.id}>
                                <td>{category.name}</td>
                                <td>{category.status}</td>
                                <td>
                                    <IconButton aria-label="Edit category">
                                        <Icon>edit</Icon>
                                    </IconButton>

                                    <IconButton aria-label="Delete category">
                                        <Icon>delete</Icon>
                                    </IconButton>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {/* <List>
  <ListItem>
    <div slot="headline">Electronics</div>
    <div slot="supporting-text">Active</div>
  </ListItem>

  <ListItem>
    <div slot="headline">Fashion</div>
    <div slot="supporting-text">Inactive</div>
  </ListItem>
</List> */}
            </section>
        </AdminPage>
    );
}

export default Categories;