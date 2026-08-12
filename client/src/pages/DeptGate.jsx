import { useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import PinPad from '../components/PinPad'
import ChainPicker from '../components/ChainPicker'
import { DEPARTMENT_META } from '../lib/constants'
import { api, getDeptToken, setDeptToken, clearDeptToken } from '../lib/api'

import MethodeForm from './dept/MethodeForm'
import ProductionForm from './dept/ProductionForm'
import RHForm from './dept/RHForm'
import QualityForm from './dept/QualityForm'
import FinaleForm from './dept/FinaleForm'
import DepotForm from './dept/DepotForm'
import LogisticsForm from './dept/LogisticsForm'
import GenericPosteForm from './dept/GenericPosteForm'
import PatronForm from './dept/PatronForm'

const FORM_BY_DEPT = {
  methode: MethodeForm,
  production: ProductionForm,
  rh: RHForm,
  quality: QualityForm,
  finale: FinaleForm,
  depot: DepotForm,
  logistics: LogisticsForm,
  coupe: GenericPosteForm,
  magasin: GenericPosteForm,
  mecanicien: GenericPosteForm,
  echantillon: GenericPosteForm,
  patron: PatronForm,
}

export default function DeptGate() {
  const { deptKey } = useParams()
  const navigate = useNavigate()
  const meta = DEPARTMENT_META[deptKey]
  const [token, setToken] = useState(() => getDeptToken(deptKey))
  const [pinError, setPinError] = useState(false)
  const [pinLoading, setPinLoading] = useState(false)
  const [chainNumber, setChainNumber] = useState(null)

  const handlePin = useCallback(
    async (pin) => {
      setPinLoading(true)
      setPinError(false)
      try {
        const res = await api.login(deptKey, pin)
        setDeptToken(deptKey, res.token)
        setToken(res.token)
      } catch (err) {
        setPinError(true)
        throw err
      } finally {
        setPinLoading(false)
      }
    },
    [deptKey]
  )

  function logout() {
    clearDeptToken(deptKey)
    setToken(null)
    setChainNumber(null)
  }

  if (!meta) {
    return <div className="p-6 text-center text-slate-400">Département introuvable.</div>
  }

  if (!token) {
    return (
      <div>
        <BackBar onBack={() => navigate('/departements')} />
        <PinPad deptLabel={meta.label} deptIcon={meta.icon} onSubmit={handlePin} error={pinError} loading={pinLoading} />
      </div>
    )
  }

  const FormComponent = FORM_BY_DEPT[deptKey]

  // Patron works across every model's P&L at once, not scoped to one chain.
  if (deptKey === 'patron') {
    return (
      <div>
        <BackBar onBack={() => navigate('/departements')} onLogout={logout} />
        <FormComponent token={token} />
      </div>
    )
  }

  if (!chainNumber) {
    return (
      <div>
        <BackBar onBack={() => navigate('/departements')} onLogout={logout} />
        <ChainPicker deptLabel={meta.label} deptKey={deptKey} onSelect={setChainNumber} />
      </div>
    )
  }

  return (
    <div>
      <BackBar onBack={() => setChainNumber(null)} onLogout={logout} label={`Chaîne ${chainNumber}`} />
      <FormComponent token={token} chainNumber={chainNumber} deptKey={deptKey} />
    </div>
  )
}

function BackBar({ onBack, onLogout, label }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <button onClick={onBack} className="text-sm text-turquoise hover:underline">
        ← Retour
      </button>
      {label && <div className="font-display text-sm font-medium text-slate-300">{label}</div>}
      {onLogout && (
        <button onClick={onLogout} className="text-xs text-slate-500 hover:text-status-bad">
          Déconnexion
        </button>
      )}
    </div>
  )
}
