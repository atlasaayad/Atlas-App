import { test } from 'node:test'
import assert from 'node:assert/strict'
import { modelName, modelOptionLabel } from './modelLabel.js'

test('libellés modèle: type affiché, jamais de "()" ni de "·" vide', () => {
  assert.equal(modelOptionLabel({ client: 'Denllo', garment_type: 'Veste', dessin: '2500' }), 'Denllo · Veste (2500)')
  assert.equal(modelName({ client: 'Denllo', garmentType: 'Veste', dessin: '2500' }), 'Denllo · Veste · 2500')
  // Old model, no type.
  assert.equal(modelOptionLabel({ client: 'Denllo', garment_type: null, dessin: '2500' }), 'Denllo (2500)')
  assert.equal(modelName({ client: 'Denllo', garmentType: null, dessin: '2500' }), 'Denllo · 2500')
  // No Dessin either.
  assert.equal(modelOptionLabel({ client: 'Denllo', dessin: '' }), 'Denllo')
  assert.equal(modelName({ client: 'Denllo', garmentType: 'Polo', dessin: null }), 'Denllo · Polo')
})
