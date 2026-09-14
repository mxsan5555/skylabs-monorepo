[Start: Salesperson Initiates Onboarding]
                        │
                        ▼
                        |- Deafult Status (Draft)
┌─────────────────────────────────────────────────┐
│ Step 1: Vendor Profile & KYC                    │
│ • Vendor First Name, Last Name, Phone No., Email, Registered Address (Address 1, Address 2, City, State, Zipcode, Google Map Location) │
│ • Multi doucment Upload feature for completing KYC process ( 1.GST 2.PAN, 3.Aadhar) any one document should get upload   │
│ • Create Vendor button will disable till KYC need to fill          │
│ • Frontend & Backend Validation Checks          │
└───────────────────────┬─────────────────────────┘
                        │ Click "Create Vendor" 
                        ▼
┌─────────────────────────────────────────────────┐
│ Step 2: States & Branches Setup                 │
│ • Select/Add State(s) (Min 1 State required)    │
│ • Add Branch(es) (Min 1 Branch per State)       │
│ • Define Branch Address  (Address 1, Address 2, City, State, Zipcode, Google Map Location), Operating Hours (M,T,W,T,F,S,S - open time / close time)        │
└───────────────────────┬─────────────────────────┘
                        │ Click "Save Branches"
                        ▼
┌─────────────────────────────────────────────────┐
│ Step 3: Deals Creation & Mapping                │
│ • Name, Description, Category, Subcategory      │
│ • Pricing & Discount Details                    │
│ • Assign/Map Deal to Specific State(s) & Branch │
└───────────────────────┬─────────────────────────┘
                        │ Click "Save & Next"
                        ▼
┌─────────────────────────────────────────────────┐
│ Step 4: Therapist Assignment                    │
│ • Add Therapist Name, Specialization, Profile   │
│ • Map Therapist to Specific State & Branch      │
└───────────────────────┬─────────────────────────┘
                        │ Click "Save & Next"
                        ▼
┌─────────────────────────────────────────────────┐
│ Step 5: Product Catalog (Vendor-Level)          │
│ • Add Product Name, Description, Pricing, Media │
│ • (Global to Vendor - No Branch Mapping needed) │
└───────────────────────┬─────────────────────────┘
                        │ Click "Save Products"
                        ▼
┌─────────────────────────────────────────────────┐
│ Step 6: Final Review & Submit                   │
│ • Verify complete completeness across all steps │
│ • Click "Submit for Approval"                   │
│ • Vendor Status: Set to "DRAFT / IN_REVIEW"     │
└───────────────────────┬─────────────────────────┘
                        │
                        ▼
          ┌───────────────────────────┐
          │  Super Admin Review Gate  │
          └─────────────┬─────────────┘
                        │
         ┌──────────────┴──────────────┐
         ▼                             ▼
    [ Rejected ]                  [ Approved ]
         │                             │
         ▼                             ▼
  • Notify Salesperson          • Vendor Status: "ACTIVE"
  • Return to Draft for Edits   • Publish Live Vendor Storefront
                                  (Locations, Deals, Staff, Products)