import { Link } from 'react-router-dom'
import { PillButton } from '../components/buttons/PillButton'

export function NotFoundPage() {
  return (
    <div className="callShell">
      <div className="card">
        <div className="sectionTitle">Not found</div>
        <p className="muted">That page doesn’t exist.</p>
        <Link to="/"><PillButton>Back home</PillButton></Link>
      </div>
    </div>
  )
}
