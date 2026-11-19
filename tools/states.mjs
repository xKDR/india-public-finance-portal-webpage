// One row per state on the site. The build scripts read this table only;
// add a state here, not in the scripts.
//
//   st          site key: public-finance/<st>/ pages and public-finance/data/<st>/
//   code        file prefix in the data repo package (KA_, TN_, ...)
//   slug        package folder: state-finances/<slug>/ in the data repo
//   unit        amount_unit of every leaf row; the build stops on any other value
//   crore_div   native unit per crore (lakh 100, thousand 10,000, rupee 10,000,000)
//   leaf        hierarchy key of the additive leaf level in the leaves NDJSON
//   leaf_label  display label of that level
//   leaf_rule   the package rule that selects the rows in <code>_budget_leaves_<year>.ndjson
//   pdf_key     what the source page key is: 'volume' (KA) or 'demand'
//   native      state name in its own script, shown next to the English name
//   pending     optional: source pages not yet extracted, shown on the landing card
//               and the state pages ({pages, text})
//   lang        BCP 47 tag of the native name only (hi, mr); head names keep the
//               language the books print them in (BR Hindi, MH English)
export const STATES = [
  {st: 'ka', code: 'KA', name: 'Karnataka', slug: 'karnataka',
    unit: 'INR_lakh', crore_div: 100, leaf: 'object_head', leaf_label: 'Object head',
    leaf_rule: "type_of_table = 'object_head' AND row_type = 'Data' AND row_level = 'Object-Head'", pdf_key: 'volume'},
  {st: 'tn', code: 'TN', name: 'Tamil Nadu', slug: 'tamil-nadu',
    unit: 'INR_thousand', crore_div: 10000, leaf: 'sub_detailed_head', leaf_label: 'Sub-detailed head',
    leaf_rule: "type_of_table = 'detailed_expenditure' AND row_type = 'Data' AND row_level = 'Sub-Detailed-Head'", pdf_key: 'demand'},
  {st: 'br', code: 'BR', name: 'Bihar', native: 'बिहार', lang: 'hi', slug: 'bihar',
    unit: 'INR', crore_div: 10000000, leaf: 'object_head', leaf_label: 'Object head',
    leaf_rule: "type_of_table = 'object_head' AND row_type = 'Data' AND row_level = 'Object-Head'",
    pdf_key: 'demand',
    pending: {pages: 623, text: 'Demand 20, major head 2210 (Medical and Public Health), in 2024-25, 2025-26 and 2026-27. Totals for demand 20 in these years are understated.'}},
  {st: 'mh', code: 'MH', name: 'Maharashtra', native: 'महाराष्ट्र', lang: 'mr', slug: 'maharashtra',
    unit: 'INR_thousand', crore_div: 10000, leaf: 'object_head', leaf_label: 'Object head',
    leaf_rule: "type_of_table = 'object_head' AND row_type = 'Data' AND row_level = 'Object-Head'",
    pdf_key: 'demand',
    pending: {pages: 368, text: '171 major-head packets in the 2010-11 to 2017-18 books. Totals for the affected major heads and years are understated.'}},
];

export const byKey = Object.fromEntries(STATES.map(s => [s.st, s]));
