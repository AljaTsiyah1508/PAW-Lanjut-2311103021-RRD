import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import WisatawanRoutes from './routes/WisatawanRoutes';
import PengelolaRoutes from './routes/PengelolaRoutes';
import AdminRoutes from './routes/AdminRoutes';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {WisatawanRoutes}
          {PengelolaRoutes}
          {AdminRoutes}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
