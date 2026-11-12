// Fixture tests for the receipt parser in docs/js/bill-splitter.js.
// No dependencies: run with `node tests/bill-splitter.test.js`.
// Real-receipt fixtures have card, payment and location details replaced.
'use strict';

var path = require('path');
var Parser = require(path.join(__dirname, '..', 'docs', 'js', 'bill-splitter.js'));

var fixtures = [
  {
    name: 'Toast (copied from the receipt page)',
    text: [
      'Check #106 \t',
      'Guest Count: 2 \t',
      'Ordered: \t11/8/26 7:22 PM',
      '  \t',
      '',
      'How was your visit?',
      'Negative Rating',
      'Somewhat_negative Rating',
      'Passive Rating',
      'Somewhat_positive Rating',
      'Positive Rating',
      '',
      'The restaurant tracks feedback and may reach out using the contact info you previously provided.',
      '  \t',
      '1 Tsubaki \t$18.00',
      '1 Kubota Nigori GLS \t$14.00',
      '1 Yellowtail Crudo \t$22.00',
      '1 Ebi Katsu \t$21.00',
      '1 Branzino with Yakisoba \t$28.00',
      '1 Umami Tobiko Clam Pasta \t$24.00',
      '1 Ice korn \t$14.00',
      '  \t',
      'Subtotal \t$141.00',
      'Tax \t$12.50',
      'Tip \t$25.38',
      'Total \t$178.88',
      '  \t',
      'Credit Card \tContactless',
      'Visa \txxxxxxxxxxxx',
      'Time \t8:53 PM',
      'Transaction Type \tSale',
      'Authorization \tApproved',
      'Approval Code \t000000',
      'Payment ID \tXXXXXXXXXXXX',
      'Application ID \tA0000000000000',
      'Application Label \tVISA CREDIT',
      'Device ID \t0000000000000000',
      'Card Reader \tBBPOS',
      'VISA CARDHOLDER',
      '  \t',
      'I agree to pay the above total amount according to my card issuer agreement',
      'Please retain for your records'
    ].join('\n'),
    expect: {
      items: [['Tsubaki', 18], ['Kubota Nigori GLS', 14], ['Yellowtail Crudo', 22], ['Ebi Katsu', 21],
        ['Branzino with Yakisoba', 28], ['Umami Tobiko Clam Pasta', 24], ['Ice korn', 14]],
      subtotal: 141, tax: 12.5, tip: 25.38, total: 178.88, allChecksOk: true
    }
  },
  {
    name: 'Square (name and price on separate lines, total at the top, tax labelled by location)',
    text: [
      'Leave negative feedback',
      '$64.76',
      '\t',
      '#AbCd',
      'Nov 1 2026 at 12:20 AM',
      'gl Giacometti Cuvée de l\'Agriate',
      '\t',
      '$19.00',
      'gl 2021 Corta y Raspa La Charanga',
      '\t',
      '$16.00',
      'deviled egg',
      '\t',
      '$4.75',
      'olives',
      '\t',
      '$9.00',
      'Purchase Subtotal\t$48.75',
      'Springfield, State (00000) (8.875%)\t$4.33',
      'Tip\t$11.68',
      'Total\t$64.76',
      'Map of merchant location',
      'Stars',
      '123 Example St'
    ].join('\n'),
    expect: {
      items: [['gl Giacometti Cuvée de l\'Agriate', 19], ['gl 2021 Corta y Raspa La Charanga', 16],
        ['deviled egg', 4.75], ['olives', 9]],
      subtotal: 48.75, tax: 4.33, tip: 11.68, total: 64.76, allChecksOk: true
    }
  },
  {
    name: 'Hand-typed notes with bare numbers',
    text: 'burger 12\nfries 4.5\nshake 6\ntax 2\ntip 5',
    expect: {
      items: [['burger', 12], ['fries', 4.5], ['shake', 6]],
      subtotal: 22.5, tax: 2, tip: 5, total: 29.5
    }
  },
  {
    name: 'Quantity with unit price that needs reconciling',
    text: '2 Tacos   $4.50\n1 Horchata   $3.00\nSubtotal  $12.00\nTax $1.00\nTotal $13.00',
    expect: {
      items: [['Tacos', 9], ['Horchata', 3]],
      subtotal: 12, tax: 1, tip: 0, total: 13, allChecksOk: true
    }
  },
  {
    name: 'Modifiers, "@" pricing and a discount',
    text: [
      '1 Caesar Salad          $11.50',
      '   + add chicken          $4.00',
      '3 Lemonade @ $3.50     $10.50',
      '1 Burger  $15.00',
      'Happy Hour  -$3.00',
      'Subtotal   $38.00',
      'Tax  $3.37',
      'Total  $41.37'
    ].join('\n'),
    expect: {
      items: [['Caesar Salad', 15.5], ['Lemonade', 10.5], ['Burger', 12]],
      subtotal: 38, tax: 3.37, tip: 0, total: 41.37, allChecksOk: true
    }
  },
  {
    name: 'Comma decimals, two taxes, service charge',
    text: [
      'Pizza ........ 14,00 €',
      'Wine ......... 22,50 €',
      'Subtotal 36,50',
      'GST 5% 1,83',
      'PST 7% 2,56',
      'Service charge 3,65',
      'Total 44,54'
    ].join('\n'),
    expect: {
      items: [['Pizza', 14], ['Wine', 22.5]],
      subtotal: 36.5, tax: 4.39, tip: 0, other: 3.65, total: 44.54, allChecksOk: true
    }
  },
  {
    name: 'Tip written after the first total, then a grand total',
    text: [
      'Ramen  $16.00',
      'Gyoza  $8.00',
      'Subtotal $24.00',
      'Tax $2.13',
      'Total $26.13',
      'Tip $4.80',
      'Grand Total $30.93',
      'Suggested tip 20% $4.80'
    ].join('\n'),
    expect: {
      items: [['Ramen', 16], ['Gyoza', 8]],
      subtotal: 24, tax: 2.13, tip: 4.8, total: 30.93, allChecksOk: true
    }
  },
  {
    name: 'Tip as a percentage only',
    text: 'Pasta $20.00\nSalad $10.00\nTax $2.66\nTip 20%',
    expect: {
      items: [['Pasta', 20], ['Salad', 10]],
      subtotal: 30, tax: 2.66, tip: 6, total: 38.66
    }
  }
];

function near(a, b) { return Math.abs((a || 0) - (b || 0)) < 0.005; }

var failures = 0;
fixtures.forEach(function (fx) {
  var r = Parser.parse(fx.text);
  var errs = [];
  var ex = fx.expect;
  var got = r.items.map(function (i) { return [i.name, i.price]; });
  if (got.length !== ex.items.length) {
    errs.push('items: expected ' + JSON.stringify(ex.items) + ', got ' + JSON.stringify(got));
  } else {
    ex.items.forEach(function (want, i) {
      if (got[i][0] !== want[0] || !near(got[i][1], want[1])) {
        errs.push('item ' + i + ': expected ' + JSON.stringify(want) + ', got ' + JSON.stringify(got[i]));
      }
    });
  }
  ['subtotal', 'tax', 'tip', 'total', 'other'].forEach(function (k) {
    if (k in ex && !near(r[k], ex[k])) errs.push(k + ': expected ' + ex[k] + ', got ' + r[k]);
  });
  if (ex.allChecksOk) {
    r.checks.forEach(function (c) { if (!c.ok) errs.push('check failed: ' + c.text); });
  }
  if (errs.length) {
    failures++;
    console.log('FAIL  ' + fx.name);
    errs.forEach(function (e) { console.log('        ' + e); });
    if (r.notes.length) console.log('        notes: ' + r.notes.join(' | '));
  } else {
    console.log('ok    ' + fx.name + (r.notes.length ? '  (' + r.notes.join(' ') + ')' : ''));
  }
});

// distributeCents always sums to the target
var parts = Parser.distributeCents([10 / 3, 10 / 3, 10 / 3], 10);
if (!near(parts.reduce(function (a, b) { return a + b; }, 0), 10)) {
  failures++;
  console.log('FAIL  distributeCents: ' + parts.join(', '));
} else {
  console.log('ok    distributeCents sums to target');
}

console.log(failures ? '\n' + failures + ' failing' : '\nall passed');
process.exit(failures ? 1 : 0);
