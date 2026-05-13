import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Apply theme synchronously before first paint to avoid flash.
// Default is light; only the explicit 'dark' stored value disables the class.
try {
  if (localStorage.getItem('passafety:theme') !== 'dark') {
    document.body.classList.add('theme-light');
  }
} catch {
  document.body.classList.add('theme-light');
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)