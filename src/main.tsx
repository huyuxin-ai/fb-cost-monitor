import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* GitHub Pages 无 SPA fallback，使用 hash 路由（#/kline?code=600519 仍可直达） */}
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)
