const fs = require('fs');
const path = require('path');

const PRICE_REF_PATH = path.join(__dirname, '..', 'data', 'ohco8x-price-reference.json');

function loadPriceReference() {
  const raw = fs.readFileSync(PRICE_REF_PATH, 'utf8');
  return JSON.parse(raw);
}

/**
 * Compare CRC's full scope against the carrier's approved scope
 * and calculate estimated supplement opportunity value.
 *
 * @param {Array} crcLineItems - CRC-generated scope line items
 *   Each: { code, description, quantity, unit }
 * @param {Array} carrierLineItems - Carrier-approved scope line items
 *   Each: { code, description, quantity, unit }
 * @returns {Object} comparison result with gap items and estimated value
 */
function compareScopes(crcLineItems, carrierLineItems) {
  const priceRef = loadPriceReference();
  const prices = priceRef.prices;

  // Index carrier items by code for fast lookup
  const carrierByCode = {};
  for (const item of carrierLineItems) {
    carrierByCode[item.code] = item;
  }

  const missingItems = [];
  const quantityGaps = [];
  let estimatedSupplementValue = 0;

  for (const crcItem of crcLineItems) {
    const carrierItem = carrierByCode[crcItem.code];
    const ref = prices[crcItem.code];
    const unitPrice = ref ? ref.price : 0;

    if (!carrierItem) {
      // Carrier omitted this line item entirely
      const value = unitPrice * crcItem.quantity;
      estimatedSupplementValue += value;
      missingItems.push({
        code: crcItem.code,
        unit: crcItem.unit,
        crcQty: crcItem.quantity,
        carrierQty: 0,
        gapQty: crcItem.quantity,
        estimatedValue: Math.round(value * 100) / 100
      });
    } else if (crcItem.quantity > carrierItem.quantity) {
      // Carrier under-scoped quantity
      const gap = crcItem.quantity - carrierItem.quantity;
      const value = unitPrice * gap;
      estimatedSupplementValue += value;
      quantityGaps.push({
        code: crcItem.code,
        unit: crcItem.unit,
        crcQty: crcItem.quantity,
        carrierQty: carrierItem.quantity,
        gapQty: gap,
        estimatedValue: Math.round(value * 100) / 100
      });
    }
  }

  return {
    priceList: priceRef.priceList,
    totalGapItems: missingItems.length + quantityGaps.length,
    missingItems,
    quantityGaps,
    estimatedSupplementValue: Math.round(estimatedSupplementValue * 100) / 100
  };
}

module.exports = { compareScopes, loadPriceReference };
