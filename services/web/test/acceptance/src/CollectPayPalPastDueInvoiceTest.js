const sinon = require('sinon')
const chai = require('chai')
const { expect } = require('chai')

chai.use(require('chai-as-promised'))
chai.use(require('sinon-chai'))

const {
  main,
} = require('../../../scripts/recurly/collect_paypal_past_due_invoice')

const RecurlyWrapper = require('../../../app/src/Features/Subscription/RecurlyWrapper')
const OError = require('@overleaf/o-error')

// from https://recurly.com/developers/api-v2/v2.21/#operation/listInvoices
const invoicesXml = invoiceIds => `
<invoices type="array">
  ${invoiceIds
    .map(
      invoiceId => `
  <invoice href="https://your-subdomain.recurly.com/v2/invoices/${invoiceId}">
    <account href="https://your-subdomain.recurly.com/v2/accounts/${invoiceId}"/>
    <subscriptions href="https://your-subdomain.recurly.com/v2/invoices/${invoiceId}/subscriptions"/>
    <address>
      <address1></address1>
      <address2></address2>
      <city></city>
      <state></state>
      <zip></zip>
      <country></country>
      <phone></phone>
    </address>
    <shipping_address>
      <name>Lon Doner</name>
      <address1>221B Baker St.</address1>
      <address2></address2>
      <city>London</city>
      <state></state>
      <zip>W1K 6AH</zip>
      <country>GB</country>
      <phone></phone>
    </shipping_address>
    <uuid>421f7b7d414e4c6792938e7c49d552e9</uuid>
    <state>paid</state>
    <invoice_number_prefix></invoice_number_prefix> <!-- Only populated for VAT Country Invoice Sequencing. Shows a country code. -->
    <invoice_number type="integer">${invoiceId}</invoice_number>
    <po_number nil="nil"></po_number>
    <vat_number nil="nil"></vat_number>
    <subtotal_in_cents type="integer">2000</subtotal_in_cents>
    <discount_in_cents type="integer">0</discount_in_cents>
    <due_on type="datetime">2018-01-30T21:11:50Z</due_on>
    <balance_in_cents type="integer">0</balance_in_cents>
    <type>charge</type>
    <origin>purchase</origin>
    <credit_invoices href="https://your-subdomain.recurly.com/v2/invoices/1325/credit_invoices"/>
    <refundable_total_in_cents type="integer">2000</refundable_total_in_cents>
    <credit_payments type="array">
    </credit_payments>
    <tax_in_cents type="integer">0</tax_in_cents>
    <total_in_cents type="integer">1200</total_in_cents>
    <currency>USD</currency>
    <created_at type="datetime">2016-06-25T12:00:00Z</created_at>
    <closed_at nil="nil"></closed_at>
    <terms_and_conditions></terms_and_conditions>
    <customer_notes></customer_notes>
    <vat_reverse_charge_notes></vat_reverse_charge_notes>
    <tax_type>usst</tax_type>
    <tax_region>CA</tax_region>
    <tax_rate type="float">0</tax_rate>
    <net_terms type="integer">0</net_terms>
    <collection_method>automatic</collection_method>
    <redemptions href="https://your-subdomain.recurly.com/v2/invoices/e3f0a9e084a2468480d00ee61b090d4d/redemptions"/>
    <line_items type="array">
      <adjustment href="https://your-subdomain.recurly.com/v2/adjustments/05a4bbdeda2a47348185270021e6087b">
      </adjustment>
    </line_items>
    <transactions type="array">
    </transactions>
  </invoice>`
    )
    .join('')}
</invoices>
`

// from https://recurly.com/developers/api-v2/v2.21/#operation/lookupAccountsBillingInfo
const billingInfoXml = `
<billing_info href="https://your-subdomain.recurly.com/v2/accounts/1/billing_info" type="credit_card">
  <paypal_billing_agreement_id>PAYPAL_BILLING_AGREEMENT_ID</paypal_billing_agreement_id>
  <account href="https://your-subdomain.recurly.com/v2/accounts/1"/>
  <first_name>Verena</first_name>
  <last_name>Example</last_name>
  <company nil="nil"/>
  <address1>123 Main St.</address1>
  <address2 nil="nil"/>
  <city>San Francisco</city>
  <state>CA</state>
  <zip>94105</zip>
  <country>US</country>
  <phone nil="nil"/>
  <vat_number nil="nil"/>
  <ip_address>127.0.0.1</ip_address>
  <ip_address_country nil="nil"/>
  <card_type>Visa</card_type>
  <year type="integer">2019</year>
  <month type="integer">11</month>
  <first_six>411111</first_six>
  <last_four>1111</last_four>
  <updated_at type="datetime">2017-02-17T15:38:53Z</updated_at>
</billing_info>
`

// from https://recurly.com/developers/api-v2/v2.21/#operation/collectAnInvoice
const invoiceCollectXml = `
<invoice href="https://your-subdomain.recurly.com/v2/invoices/1000">
  <account href="https://your-subdomain.recurly.com/v2/accounts/1"/>
  <subscriptions href="https://your-subdomain.recurly.com/v2/invoices/1000/subscriptions"/>
  <address>
    <address1>123 Main St.</address1>
    <address2 nil="nil"/>
    <city>San Francisco</city>
    <state>CA</state>
    <zip>94105</zip>
    <country>US</country>
    <phone nil="nil"/>
  </address>
  <uuid>374a37924f83c733b9c9814e9580496a</uuid>
  <state>pending</state>
  <invoice_number_prefix/>
  <invoice_number type="integer">1000</invoice_number>
  <po_number nil="nil"/>
  <vat_number nil="nil"/>
  <subtotal_in_cents type="integer">5000</subtotal_in_cents>
  <tax_in_cents type="integer">438</tax_in_cents>
  <total_in_cents type="integer">5438</total_in_cents>
  <currency>USD</currency>
  <created_at type="datetime">2016-07-11T19:25:57Z</created_at>
  <updated_at type="datetime">2016-07-11T19:25:57Z</updated_at>
  <closed_at nil="nil"/>
  <terms_and_conditions nil="nil"/>
  <customer_notes nil="nil"/>
  <tax_type>usst</tax_type>
  <tax_region>CA</tax_region>
  <tax_rate type="float">0.0875</tax_rate>
  <net_terms type="integer">0</net_terms>
  <collection_method>automatic</collection_method>
  <line_items type="array">
    <adjustment href="https://your-subdomain.recurly.com/v2/adjustments/374a2729397882fafbc82041a0a4dd0d" type="charge">
      <!-- Detail. -->
    </adjustment>
  </line_items>
  <transactions type="array">
  </transactions>
  <a name="mark_successful" href="https://your-subdomain.recurly.com/v2/invoices/1000/mark_successful" method="put"/>
  <a name="mark_failed" href="https://your-subdomain.recurly.com/v2/invoices/1000/mark_failed" method="put"/>
</invoice>
`

// from our logs
const invoiceCollectErrXml2 = `
<?xml version="1.0" encoding="UTF-8"?>
<error>
  <symbol>not_found</symbol>
  <description lang="en-US">Couldn't find BillingInfo with account_code = abcdef87654321</description>
</error>
`

describe('CollectPayPalPastDueInvoice', function () {
  let apiRequestStub
  const fakeApiRequests = invoiceIdsAndReturnCode => {
    apiRequestStub = sinon.stub(RecurlyWrapper, 'apiRequest')
    apiRequestStub.callsFake((options, callback) => {
      switch (options.url) {
        case 'invoices':
          callback(
            null,
            { statusCode: 200, headers: {} },
            invoicesXml(invoiceIdsAndReturnCode)
          )
          return
        case 'accounts/200/billing_info':
        case 'accounts/404/billing_info':
          callback(null, { statusCode: 200, headers: {} }, billingInfoXml)
          return
        case 'invoices/200/collect':
          callback(null, { statusCode: 200, headers: {} }, invoiceCollectXml)
          return
        case 'invoices/404/collect':
          callback(
            new OError(`Recurly API returned with status code: 404`, {
              statusCode: 404,
            }),
            { statusCode: 404, headers: {} },
            invoiceCollectErrXml2
          )
          return
        default:
          throw new Error(`Unexpected URL: ${options.url}`)
      }
    })
  }

  afterEach(function () {
    apiRequestStub?.restore()
  })

  it('collects one valid invoice', async function () {
    fakeApiRequests([200])
    const r = await main()
    await expect(r).to.eql({
      INVOICES_COLLECTED: [200],
      INVOICES_COLLECTED_SUCCESS: [200],
      USERS_COLLECTED: ['200'],
    })
  })

  it('rejects with no invoices are processed because of errors', async function () {
    fakeApiRequests([404])
    await expect(main()).to.be.rejectedWith('No invoices collected')
  })

  it('rejects when there are no invoices', async function () {
    fakeApiRequests([])
    await expect(main()).to.be.rejectedWith('No invoices collected')
  })

  it('resolves when some invoices are partially successful', async function () {
    fakeApiRequests([200, 404])
    const r = await main()
    await expect(r).to.eql({
      INVOICES_COLLECTED: [200, 404],
      INVOICES_COLLECTED_SUCCESS: [200],
      USERS_COLLECTED: ['200', '404'],
    })
  })
})
