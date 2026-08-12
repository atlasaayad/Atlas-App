import GlowCard from './GlowCard'

export default function NoModel({ chainNumber }) {
  return (
    <GlowCard>
      <div className="py-10 text-center text-slate-400">
        Aucun modèle actif sur la Chaîne {chainNumber}. Contactez l'Agent Méthode pour le créer.
      </div>
    </GlowCard>
  )
}
