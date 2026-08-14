// The three master lists, described declaratively so one dialog can edit all
// of them instead of three near-identical components drifting apart.
//
//   companies – YOUR firms. The letterhead on every document; labelled
//               "Seller" on a quotation and "Buyer" on a purchase order.
//   customers – the counterparty on a quotation ("Buyer").
//   suppliers – the counterparty on a purchase order ("Supplier").
export const LISTS = {
  companies: {
    title: 'Manage My Companies',
    entity: 'company',
    hasLogo: true,
    hasColor: true,
    fields: [
      ['name', 'Company Name', 'input'],
      ['worksAddress', 'Works Address', 'textarea'],
      ['phone', 'Phone', 'input'],
      ['email', 'Email', 'input'],
      ['gstin', 'GSTIN', 'input'],
      ['pan', 'PAN No.', 'input'],
      ['refPrefix', 'Ref Prefix (e.g. TE)', 'input']
    ]
  },

  customers: {
    title: 'Manage Buyers',
    entity: 'buyer',
    fields: [
      ['name', 'Company Name', 'input'],
      ['address', 'Address', 'textarea'],
      ['contact', 'Default Kind Attn (optional)', 'input']
    ]
  },

  suppliers: {
    title: 'Manage Suppliers',
    entity: 'supplier',
    fields: [
      ['name', 'Company Name', 'input'],
      ['address', 'Address', 'textarea'],
      ['contact', 'Default Kind Attn (optional)', 'input'],
      ['gstin', 'GSTIN (optional)', 'input'],
      ['pan', 'PAN No. (optional)', 'input']
    ]
  }
}
