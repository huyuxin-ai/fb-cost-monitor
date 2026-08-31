import { Routes, Route } from 'react-router'
import { AppDataProvider } from '@/lib/appData'
import { ThresholdProvider } from '@/lib/config'
import { WatchlistProvider } from '@/lib/watchlist'
import Layout from '@/components/Layout'
import Dashboard from '@/pages/Dashboard'
import MaterialsPage from '@/pages/Materials'
import KlinePage from '@/pages/Kline'
import SensitivityPage from '@/pages/Sensitivity'
import ThresholdsPage from '@/pages/Thresholds'
import DataSourcesPage from '@/pages/DataSources'

export default function App() {
  return (
    // 运行时加载 data/app_data.json（含骨架屏/失败重试），数据经 Context 下发
    <AppDataProvider>
      <WatchlistProvider>
        <ThresholdProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/materials" element={<MaterialsPage />} />
              <Route path="/kline" element={<KlinePage />} />
              <Route path="/sensitivity" element={<SensitivityPage />} />
              <Route path="/thresholds" element={<ThresholdsPage />} />
              <Route path="/sources" element={<DataSourcesPage />} />
            </Route>
          </Routes>
        </ThresholdProvider>
      </WatchlistProvider>
    </AppDataProvider>
  )
}
