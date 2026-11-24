import { Route, Navigate } from 'react-router-dom';
import ProtectedRoute from '../components/common/ProtectedRoute';
import AdminLayout from '../layouts/AdminLayout';
import AdminSummary from '../pages/admin/AdminSummary';
import AdminUsers from '../pages/admin/AdminUsers';
import AdminDestinations from '../pages/admin/AdminDestinations';
import AdminReviews from '../pages/admin/AdminReviews';
import AdminAccount from '../pages/admin/AdminAccount';

// Semua route /admin/*, khusus role admin. Dipasang langsung di dalam <Routes> pada App.jsx.
const AdminRoutes = (
  <Route
    path="/admin"
    element={
      <ProtectedRoute roles={['admin']}>
        <AdminLayout />
      </ProtectedRoute>
    }
  >
    <Route index element={<AdminSummary />} />
    <Route path="users" element={<AdminUsers />} />
    <Route path="destinasi" element={<AdminDestinations />} />
    <Route path="ulasan" element={<AdminReviews />} />
    {/* Kategori kini dikelola di Kelola Destinasi (tombol "Kelola Kategori") */}
    <Route path="kategori" element={<Navigate to="/admin/destinasi?kelola=kategori" replace />} />
    <Route path="akun" element={<AdminAccount />} />
    <Route path="*" element={<Navigate to="/admin" replace />} />
  </Route>
);

export default AdminRoutes;
