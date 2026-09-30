import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import DeptLogin from '../components/DeptLogin'
import ChainPicker from '../components/ChainPicker'
import FeedbackButton from '../components/FeedbackButton'
import { DEPARTMENT_META } from '../lib/constants'
import { getDeptToken, clearDeptToken, onSessionExpired } from '../lib/api'
import { MESSAGES } from '../lib/errors'

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
  const [chainNumber, setChainNumber] = useState(null)
  // Session expired mid-use (401 on an authenticated call, see lib/api.js):
  // the PIN pad is shown ON TOP of the form, which stays mounted — so the
  // chain, the selected model and every value typed are still there after
  // the code is entered again.
  const [expired, setExpired] = useState(false)

  useEffect(() => onSessionExpired((expiredDept) => expiredDept === deptKey && setExpired(true)), [deptKey])

  function relogged(newToken) {
    setToken(newToken)
    setExpired(false)
  }

  function logout() {
    clearDeptToken(deptKey)
    setToken(null)
    setChainNumber(null)
    setExpired(false)
  }

  if (!meta) {
    return <div className="p-6 text-center text-slate-400">Département introuvable.</div>
  }

  if (!token) {
    return (
      <div>
        <BackBar onBack={() => navigate('/departements')} />
        <DeptLogin deptKey={deptKey} deptLabel={meta.label} deptIcon={meta.icon} onLoggedIn={relogged} />
      </div>
    )
  }

  const overlay = expired && (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-navy-950/95 px-4">
      <DeptLogin
        deptKey={deptKey}
        deptLabel={meta.label}
        deptIcon={meta.icon}
        onLoggedIn={relogged}
        notice={`${MESSAGES.session.ar}\n${MESSAGES.session.fr}`}
      />
    </div>
  )

  const FormComponent = FORM_BY_DEPT[deptKey]

  // Patron works across every model's P&L at once, not scoped to one chain.
  if (deptKey === 'patron') {
    return (
      <div>
        <BackBar onBack={() => navigate('/departements')} onLogout={logout} token={token} />
        <FormComponent token={token} />
        {overlay}
      </div>
    )
  }

  if (!chainNumber) {
    return (
      <div>
        <BackBar onBack={() => navigate('/departements')} onLogout={logout} token={token} />
        <ChainPicker deptLabel={meta.label} deptKey={deptKey} onSelect={setChainNumber} />
        {overlay}
      </div>
    )
  }

  return (
    <div>
      <BackBar onBack={() => setChainNumber(null)} onLogout={logout} label={`Chaîne ${chainNumber}`} token={token} />
      <FormComponent token={token} chainNumber={chainNumber} deptKey={deptKey} />
      {overlay}
    </div>
  )
}

function BackBar({ onBack, onLogout, label, token }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <button onClick={onBack} className="text-sm text-turquoise hover:underline">
        ← Retour
      </button>
      {label && <div className="font-display text-sm font-medium text-slate-300">{label}</div>}
      <div className="flex items-center gap-3">
        {token && <FeedbackButton token={token} />}
        {onLogout && (
          <button onClick={onLogout} className="text-xs text-slate-500 hover:text-status-bad">
            Déconnexion
          </button>
        )}
      </div>
    </div>
  )
}
