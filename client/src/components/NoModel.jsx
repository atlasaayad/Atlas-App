import GlowCard from './GlowCard'
import ErrorNote from './ErrorNote'
import { errorMessage } from '../lib/errors'

// "No active model" — unless the chain simply couldn't be loaded (no
// connection, server error…): then say that, with a retry, instead of
// claiming the chain is empty.
export default function NoModel({ chainNumber, loadError, onRetry }) {
  if (loadError) {
    return (
      <GlowCard>
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <ErrorNote message={errorMessage(loadError, { load: true })} />
          {onRetry && (
            <button
              onClick={onRetry}
              className="rounded border border-turquoise/50 px-4 py-2 text-sm font-medium text-turquoise active:bg-turquoise/10"
            >
              إعادة المحاولة
            </button>
          )}
        </div>
      </GlowCard>
    )
  }
  return (
    <GlowCard>
      <div className="py-10 text-center text-slate-400">
        Aucun modèle actif sur la Chaîne {chainNumber}. Contactez l'Agent Méthode pour le créer.
      </div>
    </GlowCard>
  )
}
