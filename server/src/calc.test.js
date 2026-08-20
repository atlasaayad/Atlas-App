import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeVTMinutes, computeDT, computeObjectifJour, detectDeclineTrend } from './calc.js'
import { WORK_HOURS_PER_DAY } from './constants.js'

function approx(actual, expected, epsilon = 1e-9) {
  assert.ok(Math.abs(actual - expected) < epsilon, `expected ${actual} to be within ${epsilon} of ${expected}`)
}

test('computeVTMinutes sums TPS (seconds) and converts to minutes', () => {
  approx(computeVTMinutes([{ tps: 60 }, { tps: 120 }, { tps: 180 }]), 6)
  approx(computeVTMinutes([]), 0)
})

test('computeDT = (ND * 3600) / somme des TPS', () => {
  approx(computeDT(24, 360), 240)
  assert.equal(computeDT(24, 0), 0)
  assert.equal(computeDT(24, -5), 0)
})

test('computeObjectifJour = DT * heures de travail par jour', () => {
  approx(computeObjectifJour(240), 240 * WORK_HOURS_PER_DAY)
})

// Régression contre le modèle de démo réel (server/src/db/seed.js): 8 lignes
// de gamme totalisant 177s de TPS, ND=24 — ces chiffres sont ceux affichés
// en vrai sur l'écran Agent Méthode (VT 2.95 min, DT ≈ 488.14, Objectif/jour
// ≈ 4393). Si cette régression casse, le tableau de bord affichera un
// mauvais chiffre pour un vrai modèle en production.
test('régression: chaîne de calcul VT → DT → Objectif/jour sur le modèle de démo', () => {
  const gammeSeconds = [18, 22, 15, 30, 25, 20, 35, 12]
  const totalTps = gammeSeconds.reduce((a, b) => a + b, 0)
  const nd = 24

  const vt = computeVTMinutes(gammeSeconds.map((tps) => ({ tps })))
  approx(vt, 2.95)

  const dt = computeDT(nd, totalTps)
  approx(dt, 488.13559322033898, 1e-6)

  const objectifJour = computeObjectifJour(dt)
  approx(objectifJour, 4393.220338983051, 1e-4)
})

test('detectDeclineTrend: 3 heures consécutives en baisse stricte → alerte', () => {
  const entries = [
    { slotIndex: 3, qty: 140 },
    { slotIndex: 4, qty: 120 },
    { slotIndex: 5, qty: 90 },
  ]
  const result = detectDeclineTrend(entries)
  assert.ok(result)
  assert.equal(result.hoursDeclining, 3)
  assert.equal(result.startQty, 140)
  assert.equal(result.currentQty, 90)
})

test('detectDeclineTrend: données stables ou en hausse → pas d\'alerte', () => {
  assert.equal(detectDeclineTrend([{ slotIndex: 0, qty: 100 }, { slotIndex: 1, qty: 100 }, { slotIndex: 2, qty: 100 }]), null)
  assert.equal(detectDeclineTrend([{ slotIndex: 0, qty: 100 }, { slotIndex: 1, qty: 110 }, { slotIndex: 2, qty: 120 }]), null)
})

test("detectDeclineTrend: moins de 3 heures enregistrées aujourd'hui → jamais d'alerte (pas de conjecture)", () => {
  assert.equal(detectDeclineTrend([]), null)
  assert.equal(detectDeclineTrend([{ slotIndex: 0, qty: 140 }]), null)
  assert.equal(detectDeclineTrend([{ slotIndex: 0, qty: 140 }, { slotIndex: 1, qty: 90 }]), null)
})

test('detectDeclineTrend: une baisse ponctuelle qui remonte ensuite ne compte pas (auto-effacement)', () => {
  // baisse à l'heure 1, puis remontée à l'heure 2 — plus de baisse soutenue
  const entries = [
    { slotIndex: 0, qty: 100 },
    { slotIndex: 1, qty: 80 },
    { slotIndex: 2, qty: 95 },
  ]
  assert.equal(detectDeclineTrend(entries), null)
})

test('detectDeclineTrend: heures non consécutives (lacune) → pas de comparaison fallacieuse', () => {
  // heure 5 manquante — comparer l'heure 4 à l'heure 6 comme si elles se
  // suivaient serait trompeur, donc aucune alerte tant que le trio le plus
  // récent n'est pas vraiment consécutif.
  const entries = [
    { slotIndex: 3, qty: 140 },
    { slotIndex: 4, qty: 120 },
    { slotIndex: 6, qty: 90 },
  ]
  assert.equal(detectDeclineTrend(entries), null)
})

test('detectDeclineTrend: la série se prolonge au-delà de 3 heures si la baisse continue', () => {
  const entries = [
    { slotIndex: 0, qty: 200 },
    { slotIndex: 1, qty: 170 },
    { slotIndex: 2, qty: 140 },
    { slotIndex: 3, qty: 120 },
    { slotIndex: 4, qty: 90 },
  ]
  const result = detectDeclineTrend(entries)
  assert.equal(result.hoursDeclining, 5)
  assert.equal(result.startQty, 200)
  assert.equal(result.currentQty, 90)
})
