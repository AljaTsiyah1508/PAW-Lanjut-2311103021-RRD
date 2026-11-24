import { Route, Navigate } from 'react-router-dom';
import ProtectedRoute from '../components/common/ProtectedRoute';
import PengelolaLayout from '../layouts/PengelolaLayout';
import ManageSummary from '../pages/pengelola/ManageSummary';
import ManageDestinations from '../pages/pengelola/ManageDestinations';
import ManageReviews from '../pages/pengelola/ManageReviews';
import ManageAccount from '../pages/pengelola/ManageAccount';

// Portal pengelola /pengelola/*, khusus role pengelola. Dipasang di dalam <Routes> pada App.jsx.
const PengelolaRoutes = (
  <Route
    path="/pengelola"
    element={
      <ProtectedRoute roles={['pengelola']}>
        <PengelolaLayout />
      </ProtectedRoute>
    }
  >
    <Route index element={<ManageSummary />} />
    <Route path="destinasi" element={<ManageDestinations />} />
    <Route path="ulasan" element={<ManageReviews />} />
    <Route path="akun" element={<ManageAccount />} />
    <Route path="*" element={<Navigate to="/pengelola" replace />} />
  </Route>
);

export default PengelolaRoutes;
