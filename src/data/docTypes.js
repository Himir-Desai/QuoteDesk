// What separates a quotation from a purchase order is almost entirely wording
// and a couple of extra blocks — so it's described here and the one editor
// renders whichever it's handed. The fragile machinery (pagination, filler,
// export) is written once and shared.
export const DOC_TYPES = {
  quotations: {
    collection: 'quotations',
    noun: 'quotation',
    Noun: 'Quotation',
    title: 'QUOTATION',
    ownLabel: 'Seller', // your company, in this document's role
    partyKey: 'customer', // how the counterparty is stored (customer/supplier)
    partyLabel: 'Customer',
    partyPlaceholder: 'APOLLO TYRES LTD',
    refLabel: 'REF',
    preamble:
      'Subject to confirmation and acceptance on receipt of your order we have pleasure in quoting follows :-',
    extraMeta: [],
    hasDelivery: false,
    terms: [
      { key: 'despatch', label: 'Despatch', default: 'Ex-Our Works' },
      { key: 'delivery', label: 'Delivery', default: '6 Weeks after received the PO' },
      { key: 'gst', label: 'GST', default: '18% GST Extra' },
      { key: 'packing', label: 'Packing & Forwarding', default: '3 % Extra on Basic Value' },
      { key: 'inspection', label: 'Inspection', default: 'At our works prior to despatch' },
      { key: 'payment', label: 'Terms of Payment', default: '30% advance 70% against delivery' }
    ]
  },

  purchaseOrders: {
    collection: 'purchaseOrders',
    noun: 'purchase order',
    Noun: 'Purchase Order',
    title: 'PURCHASE ORDER',
    ownLabel: 'Buyer', // your company is the buyer on a PO
    partyKey: 'supplier',
    partyLabel: 'Supplier',
    partyPlaceholder: 'SEW EURODRIVE INDIA PVT LTD',
    refLabel: 'Purchase Ord No',
    preamble:
      'Please send your order acceptance immediately an receipt of this order. Your Invoice , packinglist and delivery challan should mention our PO No, Date and item code as per our purchase order. You may arrange to supply the following items against this order in accordance with the terms and condition attached with the order.',
    // Free-text lines shown between the title and the preamble; "Your" = the
    // supplier's, i.e. the quote/enquiry they sent that this order accepts.
    extraMeta: [
      { key: 'yourRef', label: 'Your Ref', placeholder: 'As Per Quote No : … Dated …' },
      { key: 'yourEnquiry', label: 'Your Enquiry', placeholder: 'for the … station' }
    ],
    // "Delivery At" — where the goods ship. Auto-filled from the issuing
    // company's works address, overridable per order.
    hasDelivery: true,
    terms: [
      { key: 'warranty', label: 'Warranty', default: 'One year performance guarantee' },
      { key: 'priceBasic', label: 'Price Basic', default: 'Against Performa Invoice' },
      { key: 'packing', label: 'Packing & Forwarding', default: 'All the terms as per previous supply' },
      { key: 'taxes', label: 'Taxes', default: '18% GST Extra' },
      { key: 'dispatch', label: 'Material must be dispatch', default: 'Within 2 weeks' },
      { key: 'penalty', label: 'Penalty', default: 'NIL' },
      { key: 'transportation', label: 'Transportation', default: 'by us' }
    ]
  }
}

export const termDefaults = (cfg) =>
  Object.fromEntries(cfg.terms.map((t) => [t.key, t.default]))
