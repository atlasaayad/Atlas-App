// The red, persistent error line under a form or list (see lib/errors.js
// for the wording). Renders nothing when there is no error.
export default function ErrorNote({ message, className = '' }) {
  if (!message) return null
  return (
    <p role="alert" className={`whitespace-pre-line text-sm font-medium text-status-bad ${className}`}>
      {message}
    </p>
  )
}
